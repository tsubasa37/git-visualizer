// パターン（流れで見る）のデータ。下の図はローカルリポジトリの中（コミットとブランチの札）を表す。
// チーム開発の流れだけを載せる。{start} にはプルリクエストを画面でマージして入れ、手元へは pull で取り込む（手元で merge しない・{start} へ push しない）。
// labels: [表示名, 指すコミット, 種類]  種類 head=いまいるブランチ / local=手元のブランチ / track=写し origin/…
// remote: [ブランチ名, 指すコミット]  null はリモートで削除済み
// alt: 同じことを別の書き方（switch ⇔ checkout）でするときのコマンド
// 手順で省略した commits / labels / remote / files は、1つ前の手順から引き継ぐ。
// before がある手順は、前の手順とは独立した例（その before からの変化を見せる）。
// {start} {mine} {mate} などは画面の設定で置き換わる（js/branch-names.js）。
const PATTERNS = (() => {
  const H = (b, c) => ['HEAD → ' + b, c, 'head'];
  const L = (b, c) => [b, c, 'local'];
  const T = (b, c) => ['origin/' + b, c, 'track'];
  const S = '{start}', F = '{mine}', M = '{mate}', X = 'fix/broken-header';
  const TWO_ROWS = { m: { y: 0, side: 'up' }, f: { y: 1, side: 'down' } };
  const STASHED = 'スタッシュ：stash@{0}（app.js の変更）';

  return [
    {
      id: 'start', title: '新しい作業を始めて、プルリクエストを出す',
      lead: '{start} を最新にしてから自分のブランチを切り、push してプルリクエストを出すまで。いちばん基本の流れです。',
      rows: TWO_ROWS,
      commits: {
        c1: { row: 'm', x: 0, msg: 'トップページを作成' },
        c2: { row: 'm', x: 1, msg: 'プロフィール画面を追加（ほかの人のプルリクエスト）', parents: ['c1'] },
        c3: { row: 'f', x: 2, msg: 'ログインフォームを追加', parents: ['c2'] },
      },
      start: {
        note: 'いまは {start} にいます{startNote}。前回 pull したあとに、ほかの人のプルリクエストが {start} にマージされ、リモートの {start} は c2 に進んでいます（手元にはまだ届いていません）。',
        commits: ['c1'], labels: [H(S, 'c1'), T(S, 'c1')], remote: [[S, 'c2']],
        files: '作業フォルダ：変更なし',
      },
      steps: [
        { use: 'pull', title: '{start} を最新にする',
          text: '<code>git pull</code> で、マージされた分の c2 が届き、{start} の札が c2 に進みます（fast-forward）。別のブランチにいるときは、先に <code>git switch {start}</code>（<code>git checkout {start}</code>）で移ってから pull します。',
          commits: ['c1', 'c2'], labels: [H(S, 'c2'), T(S, 'c2')] },
        { use: 'switch-c', alt: 'git checkout -b {mine}', title: '最新の {start} から、自分のブランチを切る',
          text: 'いまの位置 c2 に札 {mine} を作って移ります。ファイルは変わりません。名前は「種類/内容」（feature/…、fix/…）にするのが一般的です。',
          labels: [L(S, 'c2'), T(S, 'c2'), H(F, 'c2')] },
        { use: 'add', title: '作業して、コミットに入れるファイルを選ぶ',
          text: 'ログイン画面 login.html を作ったので、add でステージングに置きます。まだ履歴（下の図）は変わりません。',
          files: 'ステージング：login.html' },
        { use: 'commit', title: '自分のブランチに記録する',
          text: 'コミット c3 ができ、いまいる {mine} の札が c3 に進みます。{start} の札は c2 のままです。',
          commits: ['c1', 'c2', 'c3'], labels: [L(S, 'c2'), T(S, 'c2'), H(F, 'c3')],
          files: '作業フォルダ・ステージング：変更なし' },
        { use: 'push-u', title: 'リモートにも自分のブランチを作る',
          text: 'リモートに {mine} ができ、写し origin/{mine} も c3 を指します。<code>-u</code> で送り先を覚えたので、次からは <code>git push</code> だけで送れます。',
          labels: [L(S, 'c2'), T(S, 'c2'), H(F, 'c3'), T(F, 'c3')], remote: [[S, 'c2'], [F, 'c3']] },
        { event: 'remote', cmd: 'プルリクエストを作る（画面で）', title: 'プルリクエストを出す',
          text: 'GitHub や GitLab の画面で「{mine} → {start}」のプルリクエストを作ります（GitLab ではマージリクエストと呼びます）。レビューで承認されたら、マージできる権限のある人が画面で「マージ」を押して {start} に入れます。この後の流れはパターン2です。' },
      ],
    },

    {
      id: 'review-merge', title: 'レビューで直して push し、マージされたら {start} を最新にする',
      lead: 'プルリクエストを出した後の流れです。直した分は同じブランチに push するだけで反映されます。{start} へのマージは画面で行われるので、手元の {start} には pull で取り込みます。',
      rows: TWO_ROWS,
      commits: {
        c1: { row: 'm', x: 0, msg: 'トップページを作成' },
        c2: { row: 'f', x: 1, msg: 'ログインフォームを追加', parents: ['c1'] },
        c3: { row: 'f', x: 2, msg: 'レビューの指摘を反映', parents: ['c2'] },
        c4: { row: 'm', x: 3, msg: '{mine} のプルリクエストをマージ', parents: ['c1', 'c3'] },
      },
      start: {
        note: '{mine} のプルリクエストに、レビューで「ボタンの文言を直してください」と指摘が付きました。いまは {mine} にいます。',
        commits: ['c1', 'c2'], labels: [L(S, 'c1'), T(S, 'c1'), H(F, 'c2'), T(F, 'c2')],
        remote: [[S, 'c1'], [F, 'c2']], files: '作業フォルダ：変更なし',
      },
      steps: [
        { use: 'add', title: '指摘どおりに直して、ファイルを選ぶ',
          text: 'login.html のボタンの文言を直し、add でステージングに置きます。新しいブランチは作らず、同じ {mine} で続けます。',
          files: 'ステージング：login.html' },
        { use: 'commit', cmd: 'git commit -m "レビューの指摘を反映"', title: '同じブランチにコミットする',
          text: 'コミット c3 ができ、{mine} の札が c3 に進みます。',
          commits: ['c1', 'c2', 'c3'], labels: [L(S, 'c1'), T(S, 'c1'), H(F, 'c3'), T(F, 'c2')],
          files: '作業フォルダ・ステージング：変更なし' },
        { use: 'push', title: 'push すると、プルリクエストに反映される',
          text: '<code>git push</code> でリモートの {mine} が c3 に進みます。プルリクエストは {mine} を見ているので、作り直さなくても c3 が追加されます。',
          labels: [L(S, 'c1'), T(S, 'c1'), H(F, 'c3'), T(F, 'c3')], remote: [[S, 'c1'], [F, 'c3']] },
        { event: 'remote', cmd: 'プルリクエストをマージ（画面で）', title: '承認されて、画面でマージされる',
          text: 'リモートの {start} にマージコミット c4 ができます（「Create a merge commit」でマージした場合。squash でマージする設定では、c2・c3 の変更が1つのコミットにまとめられます）。マージは GitHub などの上で行われたので、手元の {start} はまだ c1 のままです。',
          remote: [[S, 'c4'], [F, 'c3']] },
        { use: 'switch', alt: 'git checkout {start}', title: '{start} に移る',
          text: '作業フォルダが、手元の {start}（c1）の中身になります。',
          labels: [H(S, 'c1'), T(S, 'c1'), L(F, 'c3'), T(F, 'c3')] },
        { use: 'pull', title: 'pull で、マージされた {start} を取り込む',
          text: 'マージコミット c4 が届き、{start} の札が c4 に進みます（fast-forward）。あなたのコミット c2・c3 が {start} の履歴に入ったことが、図で確かめられます。次の作業は、ここから新しいブランチを切ります（パターン1）。',
          commits: ['c1', 'c2', 'c3', 'c4'], labels: [H(S, 'c4'), T(S, 'c4'), L(F, 'c3'), T(F, 'c3')] },
      ],
    },

    {
      id: 'continue', title: 'ほかの人のブランチを持ってきて、続きを作業する',
      lead: 'リモートにしかないブランチを、fetch してから「手元の名前＋origin/名前」を指定して手元に作り、そのまま作業して push します。',
      rows: { m: { y: 0, side: 'up' }, t: { y: 1, side: 'down' } },
      commits: {
        c1: { row: 'm', x: 0, msg: 'お知らせ欄を追加' },
        c2: { row: 't', x: 1, msg: 'プロフィール画面を追加（ほかの人）', parents: ['c1'] },
        c3: { row: 't', x: 2, msg: 'プロフィール画面に入力チェックを追加（あなた）', parents: ['c2'] },
      },
      start: {
        note: 'ほかの人が作っているブランチ {mate} の、続きの作業を頼まれました。{mate} はリモートにだけあって、あなたの手元にはまだありません。いまは {start} にいます。',
        commits: ['c1'], labels: [H(S, 'c1'), T(S, 'c1')],
        remote: [[S, 'c1'], [M, 'c2']], files: '作業フォルダ：変更なし',
      },
      steps: [
        { use: 'fetch', title: 'リモートの最新を取ってくる',
          text: 'fetch で写し origin/{mate}（c2）が手元に来ます。まだ手元のブランチ（札）はありません。写しは fetch した時点のままなので、持ってくる直前に fetch します。',
          commits: ['c1', 'c2'], labels: [H(S, 'c1'), T(S, 'c1'), T(M, 'c2')] },
        { use: 'switch-remote', cmd: 'git checkout -b {mate} origin/{mate}', alt: 'git switch -c {mate} origin/{mate}', title: '同じ名前のブランチを手元に作って移る',
          text: '<code>-b</code> のあとが手元に作るブランチの名前、最後が元にする写し（origin/{mate}）です。手元に {mate} ができて、origin/{mate} を追跡する設定も付きます。作業フォルダは {mate} の中身になります。',
          warn: '<code>origin/{mate}</code> を書かずに <code>git checkout -b {mate}</code> とすると、いまいる {start} から切るだけで、{mate} の中身は入りません。',
          labels: [L(S, 'c1'), T(S, 'c1'), H(M, 'c2'), T(M, 'c2')] },
        { use: 'add', cmd: 'git add profile.html', title: '続きの作業をして、ファイルを選ぶ',
          text: 'プロフィール画面 profile.html に入力チェックを足したので、add でステージングに置きます。',
          files: 'ステージング：profile.html' },
        { use: 'commit', cmd: 'git commit -m "プロフィール画面に入力チェックを追加"', title: 'コミットする',
          text: 'コミット c3 ができ、{mate} の札が c3 に進みます。',
          commits: ['c1', 'c2', 'c3'], labels: [L(S, 'c1'), T(S, 'c1'), H(M, 'c3'), T(M, 'c2')],
          files: '作業フォルダ・ステージング：変更なし' },
        { use: 'push', title: 'push する（-u は要らない）',
          text: 'checkout -b のときに追跡の設定が付いたので、<code>git push</code> だけでリモートの {mate} が c3 に進みます。プルリクエストが出ていれば、そこにも反映されます。',
          labels: [L(S, 'c1'), T(S, 'c1'), H(M, 'c3'), T(M, 'c3')], remote: [[S, 'c1'], [M, 'c3']] },
      ],
    },

    {
      id: 'hotfix', title: '作業を退避して、急ぎの修正を先に出す',
      lead: '途中の変更を stash で退避し、{start} から修正用のブランチを切ってプルリクエストを出し、また元の作業に戻ります。',
      rows: { f: { y: 0, side: 'up' }, m: { y: 1, side: 'left' }, x: { y: 2, side: 'down' } },
      commits: {
        c1: { row: 'm', x: 0, msg: 'お知らせ欄を追加' },
        c2: { row: 'f', x: 1, msg: 'ログインフォームを追加', parents: ['c1'] },
        c3: { row: 'x', x: 1, msg: 'ヘッダーの崩れを修正', parents: ['c1'] },
      },
      start: {
        note: '{mine} で作業している途中（コミット前）に、「ヘッダーの表示が崩れているので、先に直してほしい」と頼まれました。',
        commits: ['c1', 'c2'], labels: [L(S, 'c1'), T(S, 'c1'), H(F, 'c2'), T(F, 'c2')],
        remote: [[S, 'c1'], [F, 'c2']], files: '作業フォルダ：app.js（変更あり・コミット前）',
      },
      steps: [
        { use: 'stash', title: '途中の変更を退避する',
          text: 'コミット前の変更をスタッシュに退避し、作業フォルダを c2 の状態に戻します。ブランチの図は変わりません。',
          files: '作業フォルダ：変更なし ／ ' + STASHED },
        { use: 'switch', alt: 'git checkout {start}', title: '{start} に移る',
          text: '修正は {start} から切るので、{start} へ移ります。作業フォルダは {start}（c1）の中身になります。',
          labels: [H(S, 'c1'), T(S, 'c1'), L(F, 'c2'), T(F, 'c2')] },
        { use: 'pull', title: '{start} を最新にする',
          text: '切る前に必ず最新にします。この例ではリモートに新しいコミットが無いので <code>Already up to date.</code> で終わり、図は変わりません。' },
        { use: 'switch-c', cmd: 'git switch -c fix/broken-header', alt: 'git checkout -b fix/broken-header', title: '修正用のブランチを切る',
          text: '不具合の修正は fix/… の名前にするのが一般的です。{start}（c1）から切るので、作業途中のログインフォームの変更は混ざりません。',
          labels: [L(S, 'c1'), T(S, 'c1'), H(X, 'c1'), L(F, 'c2'), T(F, 'c2')] },
        { use: 'add', cmd: 'git add header.html', title: '直して、ファイルを選ぶ',
          text: 'ヘッダーの崩れを header.html で直し、add でステージングに置きます。',
          files: 'ステージング：header.html ／ ' + STASHED },
        { use: 'commit', cmd: 'git commit -m "ヘッダーの崩れを修正"', title: 'コミットする',
          text: 'コミット c3 ができ、fix/broken-header の札が c3 に進みます。',
          commits: ['c1', 'c2', 'c3'], labels: [L(S, 'c1'), T(S, 'c1'), H(X, 'c3'), L(F, 'c2'), T(F, 'c2')],
          files: '作業フォルダ・ステージング：変更なし ／ ' + STASHED },
        { use: 'push-u', cmd: 'git push -u origin fix/broken-header', title: 'push してプルリクエストを出す',
          text: 'リモートに fix/broken-header を作り、画面で「fix/broken-header → {start}」のプルリクエストを出します。',
          labels: [L(S, 'c1'), T(S, 'c1'), H(X, 'c3'), T(X, 'c3'), L(F, 'c2'), T(F, 'c2')],
          remote: [[S, 'c1'], [F, 'c2'], [X, 'c3']] },
        { use: 'switch', cmd: 'git switch {mine}', alt: 'git checkout {mine}', title: '元の作業ブランチに戻る',
          text: '作業フォルダは c2 の状態に戻ります。退避した変更は、まだスタッシュの中です。',
          labels: [L(S, 'c1'), T(S, 'c1'), L(X, 'c3'), T(X, 'c3'), H(F, 'c2'), T(F, 'c2')] },
        { use: 'stash-pop', title: '退避した変更を戻す',
          text: '退避していた app.js の変更が作業フォルダに戻り、スタッシュから消えます。途中から作業を続けられます。',
          files: '作業フォルダ：app.js（変更あり） ／ スタッシュ：空' },
      ],
    },
  ];
})();
