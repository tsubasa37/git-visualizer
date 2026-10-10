// 画面の組み立て: 前提の設定 / タブ / コマンド早見表 / パターン（流れで見る）
// 設定した名前は TX（文字として。入れる前に esc する）と TH（HTML の中へ。名前は無害化済み）で差し込む。

const narrowMQ = window.matchMedia('(max-width: 760px)');
const TX = (s) => fillText(s, NAMES);
const TH = (s) => fillHTML(s, NAMES);
// 本流の札は、起点と本流が同じときは起点の札そのもの
const chipAlias = (id) => (NAMES.sameStart ? id.replace(/base$/, 'start') : id);
const withNames = (v) => ({
  ...v, cmd: TX(v.cmd), chips: (v.chips || []).map(chipAlias), still: (v.still || []).map(chipAlias),
  alts: (v.alts || []).map(([cmd, note, pre, kind]) => [TX(cmd), note, pre ? TX(pre) : '', kind]),
  sum: v.sum ? TX(v.sum) : '',
});

/* ---------- ページ内の固定の文（data-tpl） ---------- */
const TEMPLATES = new Map();
function refreshTemplates() {
  document.querySelectorAll('[data-tpl]').forEach((node) => {
    if (!TEMPLATES.has(node)) TEMPLATES.set(node, node.innerHTML);
    node.innerHTML = TH(TEMPLATES.get(node));
  });
}

/* ---------- コマンド早見表（基本・応用編） ---------- */
function cheatHeads(n) {
  const local = [['l:mine', n.mine, 'me', 'いまここ'], ['l:start', n.start, '', n.sameStart ? '' : '起点']];
  if (!n.sameStart) local.push(['l:base', n.base, '', '本流']);
  local.push(['l:origin/start', 'origin/' + n.start, 'track', '写し']);
  if (!n.sameStart) local.push(['l:origin/base', 'origin/' + n.base, 'track', '写し']);
  local.push(['l:origin/mine', 'origin/' + n.mine, 'track', '写し'], ['l:origin/mate', 'origin/' + n.mate, 'track', '写し']);
  const remote = [['r:start', n.start, '', n.sameStart ? '' : '起点']];
  if (!n.sameStart) remote.push(['r:base', n.base, '', '本流']);
  remote.push(['r:mine', n.mine, ''], ['r:mate', n.mate, '', 'ほかの人']);
  return {
    stash: { note: '（いまは空）' },
    work: { note: 'いまいるブランチのファイルが<br>ここに展開されている' },
    stage: { note: 'add したファイルが入る' },
    local: { chips: local },
    remote: { chips: remote },
  };
}

function tipHTML(c) {
  let h = `<div class="route">${routeHTML(c)}</div><p>${TH(c.what)}</p>`;
  // 別の書き方: いつでも同じ結果になるものと、場面によって結果が変わるもの（'cond'）を分けて出す
  const altItems = (list) => list.map(([cmd, note, pre]) => '<div>'
    + `<div class="acmd">${pre ? `<span>${esc(TX(pre))}</span>` : ''}<code>${esc(TX(cmd))}</code></div><div class="anote">${TH(note)}</div></div>`).join('');
  const same = (c.alts || []).filter((a) => a[3] !== 'cond'), cond = (c.alts || []).filter((a) => a[3] === 'cond');
  if (same.length) h += `<div class="alts-tip"><b>同じ結果になる書き方</b><span class="anote">どれも、いちばん上のコマンドと同じ結果です。覚えるのは1つで足ります。</span>${altItems(same)}</div>`;
  if (cond.length) h += `<div class="alts-tip cond"><b>場面によって結果が変わる書き方</b>${altItems(cond)}</div>`;
  if (c.steps) h += `<div class="steps">${c.steps.map((s) => `<div>${TH(s)}</div>`).join('')}</div>`;
  if (c.cases) {
    h += '<table><thead><tr><th>状況</th><th>どうなるか</th></tr></thead><tbody>'
      + c.cases.map(([a, b]) => `<tr><td>${esc(TX(a))}</td><td>${esc(TX(b))}</td></tr>`).join('') + '</tbody></table>';
  }
  // 起点が本流と同じときだけ空になる補足（{cloneNote} など）は出さない
  const ex = c.ex ? TH(c.ex).trim() : '';
  if (ex) h += `<div class="ex">${ex}</div>`;
  if (c.warn) h += `<div class="warn">注意：${TH(c.warn)}</div>`;
  if (c.myth) h += `<div class="myth"><b>よくある誤解：</b>${TH(c.myth)}</div>`;
  return `<div class="tip-head"><div class="tcmd">${esc(TX(c.cmd))}</div><button class="closebtn" type="button" aria-label="説明を閉じる">×</button></div>`
    + `<div class="tip-body">${h}</div>`;
}

// 1枚の盤面（基本 / 応用編）。level のコマンドだけを並べる
// ホバーは行を光らせるだけ。クリックで説明を開き、× で閉じるまで出したまま（カーソルの動きでは開閉しない）
function makeCheat(level, boardId) {
  const st = { board: null, panel: null, tip: null, list: [], hoverId: null, openId: null };
  const cmds = COMMANDS.filter((c) => c.level === level);

  // 光らせる行: カーソルが乗っている行。乗っていなければ、説明を開いている行
  function paint() {
    const item = st.list.find((x) => x.id === (st.hoverId || st.openId));
    st.list.forEach((x) => {
      x.r.classList.toggle('active', x === item);
      x.r.classList.toggle('opened', x.id === st.openId);
    });
    setActive(st.board, item ? withNames(item.c) : null);
  }
  function fillTip() {
    const item = st.list.find((x) => x.id === st.openId);
    st.tip.hidden = !item;
    if (!item) return;
    st.tip.style.setProperty('--tc-act', `var(--t-${item.c.color})`);
    st.tip.innerHTML = tipHTML(item.c);
    st.tip.querySelector('.closebtn').addEventListener('click', close);
  }
  function open(id) {
    st.openId = id;
    fillTip();
    st.tip.querySelector('.tip-body').scrollTop = 0;
    paint();
  }
  function close() {
    st.openId = null;
    fillTip();
    paint();
  }
  function render() {
    const board = st.board;
    board.innerHTML = '';
    drawLanes(board, cheatHeads(NAMES));
    const rows = el('div', 'rows');
    board.appendChild(rows);
    st.list = cmds.map((c) => {
      if (c.g) rows.appendChild(el('div', 'grp', c.g));
      const r = buildRow(withNames(c));
      rows.appendChild(r);
      r.addEventListener('mouseenter', () => { if (!narrowMQ.matches) { st.hoverId = c.id; paint(); } });
      r.addEventListener('click', () => open(c.id));
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c.id); } });
      return { id: c.id, r, c };
    });
    layoutBoard(board);
    fillTip(); // 名前を変えたときは、開いている説明も書き直す
    paint();
  }
  function init() {
    st.board = document.getElementById(boardId);
    st.panel = st.board.closest('.panel');
    attachStickyLanes(st.board);
    st.tip = el('div', 'tip');
    st.tip.hidden = true;
    st.tip.setAttribute('role', 'dialog');
    st.tip.setAttribute('aria-label', 'コマンドの説明');
    st.panel.append(st.tip, el('div', 'tip-empty', 'コマンドをクリックすると、ここに説明が出ます。'));
    st.board.addEventListener('mouseleave', () => { st.hoverId = null; paint(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.openId && !st.panel.hidden) close(); });
    new ResizeObserver(() => layoutBoard(st.board)).observe(st.board);
    render();
    document.fonts.ready.then(() => layoutBoard(st.board));
  }
  return { init, render };
}
const cheats = { cheat: makeCheat('basic', 'board-cheat'), adv: makeCheat('advanced', 'board-adv') };

/* ---------- パターン ---------- */
const GRAPH = { dx: 230, dy: 96, r: 14, lh: 24, gap: 32 };

// パターンの盤面には、その手順で打つコマンドだけを出す（別の書き方は説明の欄に alt で出す）
function stepVisual(st) {
  if (st.event) return { cmd: st.cmd, event: st.event, color: st.event };
  const c = COMMAND_BY_ID[st.use];
  return { ...c, cmd: st.cmd || c.cmd, alts: null, sum: null };
}

// 手順ごとの状態（after）と、変化を比べる基準（base）を作る
function resolvePattern(p) {
  const states = [p.start], bases = [null];
  let prev = p.start;
  p.steps.forEach((st) => {
    const base = st.before ? { ...prev, ...st.before } : prev;
    const cur = { ...base };
    ['commits', 'labels', 'remote', 'files'].forEach((k) => { if (st[k] !== undefined) cur[k] = st[k]; });
    states.push(cur);
    bases.push(base);
    prev = cur;
  });
  return { states, bases };
}

const branchOf = (text) => text.replace(/^HEAD → /, '');
// 札の幅。英数字は等幅フォントの1文字分、日本語などは1文字を広めに見積もる
const labelW = (text) => [...text].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 7.2 : 12), 16);

// 図形の座標を計算する（描画はしない）。札の文字は設定した名前に置き換えてから測る
function layoutGraph(p, state, base, dx) {
  const pos = (id) => ({ x: p.commits[id].x * dx, y: p.rows[p.commits[id].row].y * GRAPH.dy });
  const baseAt = {};
  if (base) base.labels.forEach(([t, c, k]) => { baseAt[branchOf(t)] = { c, k }; });
  const nowNames = new Set(state.labels.map(([t]) => branchOf(t)));
  const items = state.labels.map(([t, c, k]) => {
    const b = baseAt[branchOf(t)];
    const moved = !!base && (!b || b.c !== c || (k === 'head' && b.k !== 'head'));
    return { t: TX(t), c, k, moved, ghost: false };
  });
  if (base) {
    base.labels.forEach(([t, c, k]) => {
      if (!nowNames.has(branchOf(t)) && state.commits.includes(c)) items.push({ t: TX(t), c, k, moved: false, ghost: true });
    });
  }
  const byCommit = {};
  items.forEach((it) => { (byCommit[it.c] = byCommit[it.c] || []).push(it); });
  const labels = [];
  Object.entries(byCommit).forEach(([cid, its]) => {
    const { x, y } = pos(cid);
    const side = p.rows[p.commits[cid].row].side;
    its.forEach((it, i) => {
      const w = labelW(it.t), h = 20;
      let lx, cy;
      if (side === 'up') { lx = x - w / 2; cy = y - GRAPH.gap - i * GRAPH.lh; }
      else if (side === 'down') { lx = x - w / 2; cy = y + GRAPH.gap + i * GRAPH.lh; }
      else { lx = x - GRAPH.r - 10 - w; cy = y + (i - (its.length - 1) / 2) * GRAPH.lh; }
      labels.push({ ...it, x: lx, y: cy - h / 2, w, h });
    });
  });
  const commits = state.commits.map((id) => ({ id, ...pos(id), isNew: !!base && !base.commits.includes(id) }));
  const edges = [];
  state.commits.forEach((id) => {
    (p.commits[id].parents || []).forEach((par) => {
      if (state.commits.includes(par)) edges.push({ a: pos(par), b: pos(id), isNew: !!base && !base.commits.includes(id) });
    });
  });
  return { commits, edges, labels };
}

// パターン全体で札がいちばん広いときでも、隣のコミットの札と重ならない間隔にする
function patternDx(resolved) {
  let maxW = 0;
  resolved.states.forEach((s) => s.labels.forEach(([t]) => { maxW = Math.max(maxW, labelW(TX(t))); }));
  return Math.max(GRAPH.dx, maxW + 24);
}

function graphBox(p, resolved, dx) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  resolved.states.forEach((s, k) => {
    const g = layoutGraph(p, s, resolved.bases[k], dx);
    g.commits.forEach((c) => { x0 = Math.min(x0, c.x - GRAPH.r); x1 = Math.max(x1, c.x + GRAPH.r); y0 = Math.min(y0, c.y - GRAPH.r); y1 = Math.max(y1, c.y + GRAPH.r); });
    g.labels.forEach((l) => { x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x + l.w); y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y + l.h); });
  });
  const pad = 12;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

function drawGraph(p, g, box) {
  const curve = (a, b) => {
    if (a.y === b.y) return `M${a.x} ${a.y} L${b.x} ${b.y}`;
    const m = (a.x + b.x) / 2;
    return `M${a.x} ${a.y} C ${m} ${a.y}, ${m} ${b.y}, ${b.x} ${b.y}`;
  };
  let s = `<svg width="${Math.round(box.w)}" height="${Math.round(box.h)}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" role="img" aria-label="コミットとブランチの札の図">`;
  g.edges.forEach((e) => { s += `<path class="g-line${e.isNew ? ' new' : ''}" d="${curve(e.a, e.b)}"/>`; });
  g.commits.forEach((c) => {
    const label = p.commits[c.id].label || c.id;
    s += `<circle class="g-dot${c.isNew ? ' new' : ''}" cx="${c.x}" cy="${c.y}" r="${GRAPH.r}"/>`;
    s += `<text class="g-id" x="${c.x}" y="${c.y + 4}" text-anchor="middle">${esc(label)}</text>`;
  });
  g.labels.forEach((l) => {
    const cls = ['g-lab', l.k, l.moved ? 'moved' : '', l.ghost ? 'ghost' : ''].join(' ');
    s += `<g class="${cls}"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="6"/>`
      + `<text x="${l.x + l.w / 2}" y="${l.y + 14}" text-anchor="middle">${esc(l.t)}</text></g>`;
  });
  return s + '</svg>';
}

const flow = { pi: 0, cur: 0, p: null, resolved: null, dx: GRAPH.dx, box: null, rowEls: [], stepBtns: [], cardBtns: [], prevBtn: null, nextBtn: null };

function renderCards() {
  flow.cardBtns.forEach((b, i) => {
    const p = PATTERNS[i];
    b.innerHTML = `<span class="no">パターン${i + 1}</span><b>${esc(TX(p.title))}</b><span>${esc(TX(p.lead))}</span>`;
  });
}

function selectPattern(i, step = 0) {
  flow.pi = i;
  flow.p = PATTERNS[i];
  flow.resolved = resolvePattern(flow.p);
  flow.dx = patternDx(flow.resolved);
  flow.box = graphBox(flow.p, flow.resolved, flow.dx);
  flow.cardBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  const board = document.getElementById('board-flow');
  const rows = board.querySelector('.rows');
  rows.innerHTML = '';
  flow.rowEls = flow.p.steps.map((st, k) => {
    const r = buildRow(withNames(stepVisual(st)));
    r.addEventListener('click', () => go(k + 1));
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(k + 1); } });
    rows.appendChild(r);
    return r;
  });
  layoutBoard(board);
  const nav = document.getElementById('steps-nav');
  nav.innerHTML = '';
  flow.prevBtn = el('button', 'navbtn', '← 前へ');
  flow.nextBtn = el('button', 'navbtn', '次へ →');
  flow.prevBtn.type = flow.nextBtn.type = 'button';
  flow.prevBtn.addEventListener('click', () => go(flow.cur - 1));
  flow.nextBtn.addEventListener('click', () => go(flow.cur + 1));
  const labels = ['はじめ', ...flow.p.steps.map((st) => TX(stepVisual(st).cmd))];
  flow.stepBtns = labels.map((t, k) => {
    const b = el('button', 'stepbtn', `${k} ${esc(t)}`);
    b.type = 'button';
    b.addEventListener('click', () => go(k));
    return b;
  });
  nav.append(flow.prevBtn, ...flow.stepBtns, flow.nextBtn);
  go(Math.min(step, flow.p.steps.length));
}

function go(k) {
  const p = flow.p;
  if (k < 0 || k > p.steps.length) return;
  flow.cur = k;
  const state = flow.resolved.states[k], base = flow.resolved.bases[k];
  const st = k ? p.steps[k - 1] : null;
  const v = st ? withNames(stepVisual(st)) : null;
  flow.rowEls.forEach((r, i) => r.classList.toggle('active', i === k - 1));
  setActive(document.getElementById('board-flow'), v);
  flow.stepBtns.forEach((b, i) => {
    if (i === k) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.classList.toggle('done', i < k);
  });
  flow.prevBtn.disabled = k === 0;
  flow.nextBtn.disabled = k === p.steps.length;

  const head = state.labels.find(([, , kind]) => kind === 'head');
  let h = `<div class="meta"><span>パターン${flow.pi + 1}・${k ? `手順 ${k} / ${p.steps.length}` : 'はじめの状態'}</span>`
    + (head ? `<span>いまいるブランチ <span class="now">${esc(TX(branchOf(head[0])))}</span></span>` : '') + '</div>';
  if (!st) {
    h += `<h3>${esc(TX(p.title))}</h3><p>${esc(TX(p.start.note))}</p>`;
  } else {
    h += `<h3>${esc(TX(st.title))}</h3>`;
    h += v.event ? `<div class="sc event">（${esc(v.cmd)}）</div>` : `<div class="sc">$ ${esc(v.cmd)}</div>`;
    if (st.alt) h += `<div class="alt">${/^git checkout/.test(st.alt) ? 'checkout' : 'switch'} で書くなら <code>$ ${esc(TX(st.alt))}</code></div>`;
    h += `<p>${TH(st.text)}</p>`;
    if (st.out) h += `<pre>${esc(st.out)}</pre>`;
    if (st.warn) h += `<p class="w">注意：${TH(st.warn)}</p>`;
  }
  const filesText = st && st.before && base.files !== state.files ? `前：${esc(base.files)}<br>後：${esc(state.files)}` : esc(state.files);
  h += `<div class="files">${filesText}</div>`;
  document.getElementById('story').innerHTML = h;

  const g = layoutGraph(p, state, base, flow.dx);
  const legend = state.commits.map((id) => `<span><code>${esc(p.commits[id].label || id)}</code> ${esc(TX(p.commits[id].msg))}</span>`).join('');
  const remote = state.remote.map(([b, c]) => `<span><code>${esc(TX(b))}</code> → ${c ? esc(p.commits[c].label || c) : '削除済み'}</span>`).join('');
  document.getElementById('graph').innerHTML = '<div class="cap"><b>ローカルリポジトリの中（ブランチの横線）</b></div>'
    + `<div class="gscroll">${drawGraph(p, g, flow.box)}</div>`
    + `<div class="legend">${legend}</div>`
    + `<div class="remote-state"><span>リモート（origin）の札：</span>${remote}</div>`
    + '<div class="cap">● がコミット（本物の ID は a2b0b53 のような英数字）。四角い札がブランチで、どのコミットを指しているかの目印です。塗りつぶしの札がいまいるブランチ、点線の札 origin/… はリモートの写し。太枠はこの手順で動いた札、取り消し線はこの手順で消えた札です。</div>';
}

function renderFlow() {
  renderCards();
  selectPattern(flow.pi, flow.cur);
}

function initFlow() {
  const cards = document.getElementById('pcards');
  flow.cardBtns = PATTERNS.map((p, i) => {
    const b = el('button', 'pcard');
    b.type = 'button';
    b.addEventListener('click', () => selectPattern(i));
    cards.appendChild(b);
    return b;
  });
  renderCards();
  const board = document.getElementById('board-flow');
  drawLanes(board, {});
  board.appendChild(el('div', 'rows'));
  attachStickyLanes(board);
  watchLayout(board);
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('panel-flow').hidden) return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') go(flow.cur + 1);
    if (e.key === 'ArrowLeft') go(flow.cur - 1);
  });
  const m = /^#flow-(\d+)$/.exec(location.hash);
  selectPattern(m && PATTERNS[+m[1] - 1] ? +m[1] - 1 : 0);
}

/* ---------- タブ ---------- */
const ready = { cheat: false, adv: false, flow: false };
function initTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  const inits = { cheat: cheats.cheat.init, adv: cheats.adv.init, flow: initFlow };
  function select(t) {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
    });
    const key = t.id.replace('tab-', '');
    if (!ready[key]) { ready[key] = true; inits[key](); }
    // 隠れている間に描き直した盤面は幅 0 で位置を決められないので、表示したらすぐ決め直す
    document.querySelectorAll(`#${t.getAttribute('aria-controls')} .board`).forEach((b) => layoutBoard(b));
    updateStickyLanes();
  }
  const count = (level) => COMMANDS.filter((c) => c.level === level).length;
  document.querySelector('#tab-cheat small').textContent = `毎日使う${count('basic')}個`;
  document.querySelector('#tab-adv small').textContent = `ときどき使う${count('advanced')}個`;
  document.querySelector('#tab-flow small').textContent = `流れで見る・${PATTERNS.length}パターン`;
  tabs.forEach((t) => t.addEventListener('click', () => select(t)));
  const byHash = /^#flow/.test(location.hash) ? 'tab-flow' : location.hash === '#adv' ? 'tab-adv' : 'tab-cheat';
  select(document.getElementById(byHash));
}

initSettings();
refreshTemplates();
onNamesChange(() => {
  refreshTemplates();
  if (ready.cheat) cheats.cheat.render();
  if (ready.adv) cheats.adv.render();
  if (ready.flow) renderFlow();
});
initTabs();
