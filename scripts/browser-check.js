// ブラウザで開いたページの動作を確かめるテスト。
// 使い方: index.html を開き、開発者ツールのコンソールにこのファイルの中身を貼って実行する。
// 結果は { pass, fail, failures } で返る。最後に設定を初期値へ戻す。
(async () => {
  const failures = [];
  let pass = 0;
  const expect = (msg, cond) => { if (cond) pass++; else failures.push(msg); };
  const $ = (id) => document.getElementById(id);
  const type = (id, value) => { const i = $(id); i.value = value; i.dispatchEvent(new Event('input', { bubbles: true })); };
  const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText).join('\n');
  const openTab = (id) => $(id).click();
  const tipOf = (board) => $(board).closest('.panel').querySelector('.tip');
  const DEFAULTS = ['feature/login-form', 'feature/profile-page'];
  // 名前が出る場所（前提カードの一般的な説明文は除く）
  const NAMED_AREAS = '#board-cheat, #board-adv, #board-flow, #story, #graph, #pcards, #steps-nav, .notes, .here';

  // ブランチ図: 全パターン・全手順で、札どうし・札とコミットの重なりと、図からのはみ出しを数える
  function graphIssues() {
    const issues = [];
    openTab('tab-flow');
    const cards = [...document.querySelectorAll('#pcards .pcard')];
    cards.forEach((card, pi) => {
      card.click();
      [...document.querySelectorAll('#steps-nav .stepbtn')].forEach((btn, si) => {
        btn.click();
        const svg = document.querySelector('#graph svg');
        const rects = [...svg.querySelectorAll('.g-lab rect')].map((r) => { const b = r.getBBox(); return { t: r.nextElementSibling.textContent, x: b.x, y: b.y, w: b.width, h: b.height }; });
        const dots = [...svg.querySelectorAll('circle')].map((c) => ({ t: 'commit', x: +c.getAttribute('cx') - 14, y: +c.getAttribute('cy') - 14, w: 28, h: 28 }));
        const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        const vb = svg.viewBox.baseVal;
        rects.forEach((a, i) => {
          rects.slice(i + 1).forEach((b) => { if (hit(a, b)) issues.push(`P${pi + 1}-${si}: 札の重なり ${a.t} × ${b.t}`); });
          dots.forEach((d) => { if (hit(a, d)) issues.push(`P${pi + 1}-${si}: 札とコミットの重なり ${a.t}`); });
        });
        [...rects, ...dots].forEach((r) => { if (r.x < vb.x || r.y < vb.y || r.x + r.w > vb.x + vb.width || r.y + r.h > vb.y + vb.height) issues.push(`P${pi + 1}-${si}: 図の外 ${r.t}`); });
      });
    });
    cards[0].click();
    return issues;
  }
  // 全パターン・全手順の説明とボタンの文字をまとめて取る
  function allFlowText() {
    openTab('tab-flow');
    let all = '';
    [...document.querySelectorAll('#pcards .pcard')].forEach((card) => {
      card.click();
      [...document.querySelectorAll('#steps-nav .stepbtn')].forEach((btn) => { btn.click(); all += text('#story, #graph, #steps-nav, #board-flow') + '\n'; });
    });
    document.querySelector('#pcards .pcard').click();
    return all + text('#pcards');
  }
  // 早見表（基本・応用編）の全コマンドを1つずつクリックして、説明の文字をまとめて取る（最後は閉じる）
  function allTipText() {
    let all = '';
    [['tab-cheat', 'board-cheat'], ['tab-adv', 'board-adv']].forEach(([tab, board]) => {
      openTab(tab);
      const tip = tipOf(board);
      $(board).querySelectorAll('.row').forEach((r) => { r.click(); all += tip.innerText + '\n'; });
      tip.querySelector('.closebtn').click();
      all += text('#' + board) + '\n';
    });
    openTab('tab-cheat');
    return all;
  }

  // 1. 初期値と構成
  $('s-reset').click();
  expect('初期値: いまいるブランチが feature/login-form', document.querySelector('.here .now').textContent === 'feature/login-form');
  openTab('tab-adv'); openTab('tab-cheat');
  const basicRows = $('board-cheat').querySelectorAll('.row').length, advRows = $('board-adv').querySelectorAll('.row').length;
  const nBasic = COMMANDS.filter((c) => c.level === 'basic').length, nAdv = COMMANDS.filter((c) => c.level === 'advanced').length;
  expect('構成: 早見表（基本）に基本のコマンドがすべて並ぶ', basicRows === nBasic);
  expect('構成: 応用編に応用のコマンドがすべて並ぶ', advRows === nAdv);
  expect('構成: タブの個数表示がデータと一致する', $('tab-cheat').textContent.includes(`${nBasic}個`) && $('tab-adv').textContent.includes(`${nAdv}個`) && $('tab-flow').textContent.includes(`${PATTERNS.length}パターン`));
  expect('構成: タブは 早見表 → 応用編 → パターン の順', [...document.querySelectorAll('.tab')].map((t) => t.id).join(',') === 'tab-cheat,tab-adv,tab-flow');
  openTab('tab-flow');
  expect('構成: パターンがすべて並ぶ', document.querySelectorAll('#pcards .pcard').length === PATTERNS.length);
  openTab('tab-cheat');
  const rowOf = (board, cmd) => [...$(board).querySelectorAll('.row')].find((r) => r.dataset.cmd === cmd);
  // 同じ結果になる書き方は、クリックで開く説明の「同じ結果になる書き方」に出る
  const popupAlts = (board, cmd) => {
    rowOf(board, cmd).click();
    const t = tipOf(board), list = [...t.querySelectorAll('.alts-tip:not(.cond) .acmd code')].map((c) => c.textContent);
    t.querySelector('.closebtn').click();
    return list;
  };
  const basicCmds = [...$('board-cheat').querySelectorAll('.row')].map((r) => r.dataset.cmd);
  const advCmds = [...$('board-adv').querySelectorAll('.row')].map((r) => r.dataset.cmd);
  // 同じ結果の書き方は1行にまとめ、クリックで開く説明に出す
  [['git switch master', ['git checkout master']],
    ['git switch -c feature/login-form', ['git checkout -b feature/login-form']],
    ['git switch feature/profile-page', ['git checkout feature/profile-page', 'git switch -t origin/feature/profile-page', 'git checkout -t origin/feature/profile-page', 'git switch -c feature/profile-page origin/feature/profile-page', 'git checkout -b feature/profile-page origin/feature/profile-page']],
    ['git fetch', ['git fetch origin']],
    ['git push -u origin feature/login-form', ['git push --set-upstream origin feature/login-form']],
    ['git restore login.html', ['git checkout -- login.html']],
    ['git restore --staged login.html', ['git reset HEAD login.html']],
  ].forEach(([cmd, alts]) => {
    expect(`早見表: ${cmd} の行がある`, basicCmds.includes(cmd));
    const got = popupAlts('board-cheat', cmd);
    alts.forEach((a) => {
      expect(`早見表: ${a} は ${cmd} の説明に「同じ結果になる書き方」として出る`, got.includes(a));
      expect(`早見表: ${a} は別の行になっていない`, !basicCmds.includes(a));
    });
  });
  const boardText = $('board-cheat').innerText + $('board-adv').innerText;
  expect('盤面: 同じ結果の書き方（「または」「別の書き方」「条件つき」）は盤面に出さない', !/または|別の書き方|条件つき/.test(boardText));
  // 矢印の下には、そのコマンドが何をするかを1行で出す
  const sumOf = (board, cmd) => rowOf(board, cmd)?.querySelector('.sum')?.textContent;
  expect('盤面: すべてのコマンドの矢印の下に、何をするかの1行が出る', [...document.querySelectorAll('#board-cheat .row, #board-adv .row')].every((r) => r.querySelector('.sum')?.textContent.trim()));
  expect('盤面: 1行の説明はデータの文言どおり（名前は設定どおりに入る）', COMMANDS.every((c) => sumOf(c.level === 'basic' ? 'board-cheat' : 'board-adv', TX(c.cmd)) === TX(c.sum)));
  expect('盤面: 例 git switch master の下は「master に移る」', sumOf('board-cheat', 'git switch master') === 'master に移る');
  expect('早見表: git merge は早見表に無い（行にも別の書き方にも）', !/git merge/.test($('board-cheat').innerText));

  // 説明はクリックで開き、× で閉じる。ホバーは行を光らせるだけ
  const cheatTip = tipOf('board-cheat');
  const enter = (cmd) => rowOf('board-cheat', cmd).dispatchEvent(new MouseEvent('mouseenter'));
  expect('操作: はじめは説明が閉じている', cheatTip.hidden);
  if (window.innerWidth >= 1160) expect('操作: 広い画面では、閉じているあいだ説明の場所に案内が出る', getComputedStyle($('panel-cheat').querySelector('.tip-empty')).display !== 'none');
  enter('git status');
  if (!narrowMQ.matches) expect('操作: ホバーで行が光る', rowOf('board-cheat', 'git status').classList.contains('active'));
  expect('操作: ホバーでは説明が開かない', cheatTip.hidden);
  rowOf('board-cheat', 'git fetch').click();
  expect('操作: クリックで説明が開く', !cheatTip.hidden && cheatTip.querySelector('.tcmd').textContent === 'git fetch');
  expect('操作: 説明に、同じ結果になる書き方が出る', cheatTip.querySelector('.alts-tip')?.innerText.includes('git fetch origin'));
  enter('git add login.html');
  expect('操作: 説明を開いたまま別の行にカーソルを動かしても、説明は変わらない', !cheatTip.hidden && cheatTip.querySelector('.tcmd').textContent === 'git fetch');
  $('board-cheat').dispatchEvent(new MouseEvent('mouseleave'));
  expect('操作: 盤面から出ると、説明を開いている行が光る', rowOf('board-cheat', 'git fetch').classList.contains('active'));
  const tr = cheatTip.getBoundingClientRect(), sr = $('board-cheat').parentElement.getBoundingClientRect();
  if (window.innerWidth >= 1160) expect('位置: 広い画面では、説明は盤面の右の列に出て、盤面に重ならない', tr.left >= sr.right - 0.5 && getComputedStyle(cheatTip).position === 'sticky');
  else if (window.innerWidth > 760) expect('位置: 中くらいの画面では、説明は画面の右端に出る', getComputedStyle(cheatTip).position === 'fixed' && window.innerWidth - tr.right < 40 && tr.top <= 16.5);
  else expect('位置: スマホでは、説明は画面の下から出る', tr.left <= 0.5 && Math.abs(tr.bottom - window.innerHeight) < 1 && tr.height <= window.innerHeight * 0.6 + 1);
  cheatTip.querySelector('.closebtn').click();
  expect('操作: × で閉じる', cheatTip.hidden);
  rowOf('board-cheat', 'git fetch').click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect('操作: Esc でも閉じる', cheatTip.hidden);
  rowOf('board-cheat', 'git fetch').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect('操作: キーボードの Enter でも開く', !cheatTip.hidden);
  cheatTip.querySelector('.closebtn').click();

  // リモートにしか無いブランチを持ってくる行
  const fi = basicCmds.indexOf('git fetch');
  expect('早見表: git fetch のすぐ下が、リモートのブランチに移る行（名前だけの git switch）', basicCmds[fi + 1] === 'git switch feature/profile-page');
  rowOf('board-cheat', 'git switch feature/profile-page').click();
  const remoteTip = cheatTip.innerText;
  expect('早見表: リモートのブランチの説明に、-b / -c なら origin/名前 まで書く注意と、確かめ方が出る',
    remoteTip.includes('-b（switch では -c）を付けるときは、必ず origin/feature/profile-page まで書きます') && remoteTip.includes('set up to track') && remoteTip.includes('文面は Git のバージョンによって少し違います'));
  expect('早見表: リモートのブランチは、リモートに取りに行かず写しから作ると説明する', remoteTip.includes('リモートには取りに行かず、fetch で届いた写し origin/feature/profile-page から'));
  const chipHit = (id) => $('board-cheat').querySelector(`.chip[data-id="${id}"]`)?.classList.contains('hit');
  expect('早見表: リモートのブランチの行では、写し origin/… の札が光り、リモートの列の札は光らない', chipHit('l:origin/mate') && !chipHit('r:mate'));
  expect('早見表: リモートのブランチの説明に、この行の前提と違う話（手元に同じ名前がある場合）は出ない', !remoteTip.includes('already exists'));
  rowOf('board-cheat', 'git pull').click();
  expect('早見表: git pull origin master は盤面に出さず、説明の中に「master にいるとき」として出る',
    !rowOf('board-cheat', 'git pull').innerText.includes('git pull origin') && cheatTip.innerText.includes('場面によって結果が変わる書き方') && cheatTip.innerText.includes('master にいるとき'));
  expect('早見表: pull が止まる話に、Git のバージョン（2.33.1 以降）が書いてある', cheatTip.innerText.includes('Git 2.33.1 以降。それより前のバージョンは止まらず'));
  expect('前提: Git 2.23 以降が前提で、古い Git では checkout の書き方を使うと書いてある', document.querySelector('.premise').innerText.includes('Git 2.23 以降が前提です'));
  cheatTip.querySelector('.closebtn').click();
  expect('早見表: git pull origin master は早見表の行になく、応用編の行にある', !basicCmds.includes('git pull origin master') && advCmds.includes('git pull origin master'));
  openTab('tab-adv');
  rowOf('board-adv', 'git pull origin master').click();
  expect('応用編: git fetch → git merge origin/master は、説明の中に出る', tipOf('board-adv').innerText.includes('git fetch → git merge origin/master'));
  tipOf('board-adv').querySelector('.closebtn').click();
  expect('応用編: --cached は --staged の説明に「同じ結果になる書き方」として出る', popupAlts('board-adv', 'git diff --staged').includes('git diff --cached'));
  openTab('tab-cheat');
  // 矢印の下の1行が、矢印・次の行と重ならず、盤面の左右に収まる
  function altLayoutIssues(boardId) {
    const issues = [];
    const b = $(boardId).getBoundingClientRect();
    const rows = [...$(boardId).querySelectorAll('.row')];
    rows.forEach((r, i) => {
      const a = r.querySelector('.sum');
      if (!a) return;
      const ra = a.getBoundingClientRect(), rr = r.getBoundingClientRect(), seg = r.querySelector('.seg, .dot.mark')?.getBoundingClientRect();
      if (ra.bottom > rr.bottom + 0.5) issues.push(`${r.dataset.cmd}: 行の下にはみ出す`);
      if (seg && ra.top < seg.bottom - 1) issues.push(`${r.dataset.cmd}: 矢印と重なる`);
      if (ra.left < b.left - 0.5 || ra.right > b.right + 0.5) issues.push(`${r.dataset.cmd}: 盤面の左右からはみ出す`);
      const next = rows[i + 1];
      if (next && next.getBoundingClientRect().top < ra.bottom - 0.5) issues.push(`${r.dataset.cmd}: 次の行と重なる`);
    });
    return issues;
  }
  openTab('tab-adv'); const advAltIssues = altLayoutIssues('board-adv');
  openTab('tab-cheat'); const altIssues = altLayoutIssues('board-cheat');
  expect(`早見表: 矢印の下の1行が、矢印・次の行と重ならない ${altIssues.join(' / ')}`, altIssues.length === 0);
  expect(`応用編: 矢印の下の1行が、矢印・次の行と重ならない ${advAltIssues.join(' / ')}`, advAltIssues.length === 0);
  // パターンはチーム開発の流れ（{start} には画面でマージして入れる）
  const flow0 = allFlowText();
  expect('パターン: 手元での merge・rebase・pull origin が出ない', !/git (merge|rebase)\b|git pull origin/.test(flow0));
  expect('パターン: master へ push しない', !/git push( -u)? origin master\b/.test(flow0));
  expect('パターン: マージは画面で行い、master に移って pull で取り込む', flow0.includes('プルリクエストをマージ（画面で）') && flow0.includes('git switch master') && flow0.includes('checkout で書くなら') && flow0.includes('git checkout master'));
  expect('全体: 「本番」と書いていない', !/本番/.test(allTipText() + flow0 + document.body.innerText));
  openTab('tab-cheat');
  expect('初期値: 図の札の重なりなし', graphIssues().length === 0);

  // 2. 本流 main・起点 develop・名前も変更
  $('s-base-main').click();
  $('s-start-other').click();
  $('s-start-other').dispatchEvent(new Event('change', { bubbles: true }));
  type('s-start-name', 'develop');
  type('s-mine', 'feature/login-page');
  type('s-mate', 'feature/profile-ui');
  expect('変更後: 設定が反映される', NAMES.base === 'main' && NAMES.start === 'develop' && NAMES.mine === 'feature/login-page' && NAMES.mate === 'feature/profile-ui');
  const tips = allTipText(), flowText = allFlowText(), named = text(NAMED_AREAS);
  DEFAULTS.forEach((o) => expect(`変更後: 早見表・応用編に古い名前 ${o} が残っていない`, !tips.includes(o)));
  DEFAULTS.forEach((o) => expect(`変更後: パターンに古い名前 ${o} が残っていない`, !flowText.includes(o)));
  expect('変更後: 早見表・パターンに master が残っていない', !/\bmaster\b/.test(tips + flowText + named));
  expect('変更後: 早見表に git pull origin develop が出る', tips.includes('git pull origin develop'));
  expect('変更後: 早見表に checkout の書き方が出る', tips.includes('git checkout -b feature/profile-ui origin/feature/profile-ui'));
  expect('変更後: 応用編に git merge origin/develop が出る', tips.includes('git merge origin/develop'));
  expect('変更後: パターンに checkout 版の手順が出る', flowText.includes('git checkout -b feature/profile-ui origin/feature/profile-ui'));
  expect('変更後: パターンに「develop に移って pull」が出て、手元の merge は出ない', flowText.includes('git switch develop') && flowText.includes('git switch feature/login-page') && !/git merge/.test(flowText));
  expect('変更後: パターンに checkout での書き方も併記される', flowText.includes('checkout で書くなら') && flowText.includes('git checkout develop'));
  expect('変更後: パターンに switch での書き方も併記される', flowText.includes('switch で書くなら') && flowText.includes('git switch -c feature/profile-ui origin/feature/profile-ui'));
  expect('変更後: clone の説明に「既定のブランチでなければ git switch develop」が出る', tips.includes('起点の develop が既定のブランチでなければ、このあと git switch develop で移ります'));
  expect('変更後: パターン1の最初に clone 直後の補足が出る', flowText.includes('clone した直後は、リモートの既定のブランチにいます。develop でなければ git switch develop で移ります'));
  expect('変更後: 条件つきの git pull origin develop は「develop にいるとき」', tips.includes('develop にいるとき') && tips.includes('git pull origin develop'));
  expect('変更後: リモートの札に本流 main と起点 develop が並ぶ', text('#board-cheat .head[data-lane="remote"]').includes('main') && text('#board-cheat .head[data-lane="remote"]').includes('develop'));
  expect('変更後: 図の札の重なりなし', graphIssues().length === 0);

  // 3. 使えない名前・ぶつかる名前は反映しない
  type('s-mine', 'feature/my test');
  expect('スペース入り: エラーが出る', $('m-mine').classList.contains('err') && $('m-mine').textContent.includes('反映していません'));
  expect('スペース入り: 反映しない', NAMES.mine === 'feature/login-page');
  type('s-mine', 'feature/profile-ui');
  expect('ほかの人と同じ名前: エラーが出て反映しない', $('m-mine').classList.contains('err') && NAMES.mine === 'feature/login-page');
  type('s-mine', 'develop');
  expect('起点と同じ名前: エラーが出て反映しない', $('m-mine').classList.contains('err') && NAMES.mine === 'feature/login-page');

  // 4. 長い名前・日本語の名前でも図が崩れない
  type('s-mine', 'feature/very-long-branch-name-for-layout-check-2026');
  expect('長い名前: 図の札の重なりなし', graphIssues().length === 0);
  // 名前は別のタブ（パターン）を開いている間に変えたので、開いた直後の位置を確かめることになる
  openTab('tab-cheat');
  const longAltIssues = altLayoutIssues('board-cheat');
  expect(`長い名前: 矢印の下の1行が重ならない ${longAltIssues.join(' / ')}`, longAltIssues.length === 0);
  type('s-mine', 'feature/ユーザー登録画面');
  expect('日本語の名前: 注意が出て反映される', $('m-mine').classList.contains('note') && NAMES.mine === 'feature/ユーザー登録画面');
  expect('日本語の名前: 図の札の重なりなし', graphIssues().length === 0);

  // 5. 名前に < > を入れても HTML として解釈されない
  type('s-mine', 'feature/<b>x');
  openTab('tab-cheat');
  const html = document.body.innerHTML;
  expect('< > 入り: 文字として表示される', html.includes('feature/&lt;b&gt;x') && !html.includes('feature/<b>x'));

  // 6. 保存と初期化
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('git-visualizer:names:v1')); } catch (e) { failures.push(`保存: 読めない（${e.name}）`); }
  expect('保存: 最後に反映した名前が保存されている', saved && saved.mine === 'feature/<b>x');
  $('s-reset').click();
  expect('初期化: 初期値に戻る', NAMES.base === 'master' && NAMES.start === 'master' && NAMES.mine === 'feature/login-form' && NAMES.mate === 'feature/profile-page');
  expect('初期化: 早見表に初期値の名前が戻る', allTipText().includes('git pull origin master'));
  openTab('tab-cheat');

  // 7. 前提カードと盤面の見た目（クラス名がぶつかって崩れたことがあるため）
  const seg = document.querySelector('.segctl').getBoundingClientRect();
  expect('前提カード: master/main の切り替えが見えている', seg.height >= 20 && seg.width >= 60);
  if (window.innerWidth > 560) {
    const lab = $('l-base').getBoundingClientRect();
    expect('前提カード: ラベルと切り替えが同じ行に並ぶ', Math.abs((lab.top + lab.bottom) / 2 - (seg.top + seg.bottom) / 2) < 12);
  }
  expect('盤面: 矢印の線に枠線が付いていない', getComputedStyle(document.querySelector('#board-cheat .seg:not(.look)')).borderTopWidth === '0px');

  // 8. スクロールしても5つの場所の名前が上に出る（3つの盤面すべて）
  [['tab-cheat', 'board-cheat'], ['tab-adv', 'board-adv'], ['tab-flow', 'board-flow']].forEach(([tab, id]) => {
    openTab(tab);
    const board = $(id), bar = board.stickyBar, scroller = board.parentElement;
    const scrollTo = (y) => { window.scrollTo(0, y); window.dispatchEvent(new Event('scroll')); };
    const aligned = () => {
      const cells = [...bar.querySelectorAll('.ls-cell')].map((c) => c.getBoundingClientRect());
      const lanes = [...board.querySelectorAll('.lb')].map((c) => c.getBoundingClientRect());
      return cells.every((c, i) => Math.abs(c.left - lanes[i].left) < 1.5 && Math.abs(c.width - lanes[i].width) < 1.5);
    };
    scrollTo(0);
    expect(`${tab}: 一番上では名前の行が出ない`, bar.hidden);
    const headsTop = board.querySelector('.heads').getBoundingClientRect().top + window.scrollY;
    scrollTo(headsTop + 60);
    expect(`${tab}: 見出しが隠れるまでスクロールすると名前の行が出る`, !bar.hidden);
    expect(`${tab}: 名前の行の列が盤面の列とそろう`, aligned());
    if (scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft = 150; scroller.dispatchEvent(new Event('scroll'));
      expect(`${tab}: 盤面を横にスクロールしても列がそろう`, aligned());
      scroller.scrollLeft = 0; scroller.dispatchEvent(new Event('scroll'));
    }
    const sameOn = [...bar.querySelectorAll('.ls-cell')].every((c) => c.classList.contains('on') === board.querySelector(`.lb[data-lane="${c.dataset.lane}"]`).classList.contains('on'));
    expect(`${tab}: 名前の行でも、光っている場所が盤面と同じ`, sameOn);
    // 盤面を通り過ぎたら消える（下に十分な余白があって、そこまでスクロールできるときだけ確かめる）
    const past = board.getBoundingClientRect().bottom + window.scrollY - 40;
    if (past <= document.documentElement.scrollHeight - window.innerHeight) {
      scrollTo(past);
      expect(`${tab}: 盤面を通り過ぎると名前の行が消える`, bar.hidden);
    }
    scrollTo(0);
  });
  openTab('tab-cheat');

  // 9. ページが横にはみ出さない
  expect('ページが横にはみ出さない', document.documentElement.scrollWidth <= window.innerWidth);
  return { pass, fail: failures.length, failures };
})();
