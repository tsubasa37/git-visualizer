// データの食い違い（存在しない場所・コミット・札の参照、HEAD が無い状態など）を見つける。
// 名前を設定で変えられるように、データに master や feature/… を直接書いていないかも調べる。
// 使い方: node scripts/check-data.mjs   （問題なければ exit 0）
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('..', import.meta.url);
const code = ['js/data-commands.js', 'js/data-patterns.js', 'js/branch-names.js'].map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n');
const { LANES, COMMANDS, PATTERNS, NAME_DEFAULTS, resolveNames, fillText } = runInNewContext(`${code}\n;({ LANES, COMMANDS, PATTERNS, NAME_DEFAULTS, resolveNames, fillText })`);

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const isLane = (l) => LANES.includes(l);
const CHIPS = new Set(['l:mine', 'l:start', 'l:base', 'l:origin/start', 'l:origin/base', 'l:origin/mine', 'l:origin/mate', 'r:start', 'r:base', 'r:mine', 'r:mate']);
const PLACEHOLDERS = new Set(['base', 'start', 'mine', 'mate', 'startNote', 'cloneNote']);
// 設定で変わる名前を、データに直接書いていないか（{start} などを使う）
const HARD_CODED = /\bmaster\b|\bmain\b|\bdevelop\b|feature\/login-form|feature\/profile-page/;
// チーム開発の前提: 本流・起点には画面でマージして入れる。手元で取り込む（merge・rebase・pull origin）のは応用編だけ
const LOCAL_INTEGRATE = /\bgit (merge|rebase)\b|\bgit pull origin\b/;
const PUSH_TO_START = /\bgit push\b.*\{(start|base)\}/;

// データの中の文字列をすべて調べる
function scanStrings(where, value) {
  if (typeof value === 'string') {
    for (const [, key] of value.matchAll(/\{([A-Za-z]+)\}/g)) if (!PLACEHOLDERS.has(key)) err(where, `知らない差し込み {${key}}: ${value.slice(0, 40)}`);
    if (HARD_CODED.test(value)) err(where, `名前を直接書いている（{start} などを使う）: ${value.slice(0, 60)}`);
    if (value.includes('本番')) err(where, `「本番」は書かない（本流の扱いは前提として説明に入れない）: ${value.slice(0, 60)}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => scanStrings(`${where}[${i}]`, v));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => scanStrings(`${where}.${k}`, v));
}

const ids = new Set();
COMMANDS.forEach((c) => {
  const w = `コマンド ${c.id}`;
  if (ids.has(c.id)) err(w, 'id が重複'); ids.add(c.id);
  ['cmd', 'sum', 'what', 'color'].forEach((k) => { if (!c[k]) err(w, `${k} が無い`); });
  // 矢印の下に1行で出すので短くする
  if (c.sum && [...fillText(c.sum, resolveNames(NAME_DEFAULTS))].length > 32) err(w, `sum が長すぎる（初期値の名前を入れて32文字まで）: ${c.sum}`);
  if (c.level !== 'basic' && c.level !== 'advanced') err(w, `level が basic / advanced ではない: ${c.level}`);
  if (!isLane(c.color)) err(w, `color が場所ではない: ${c.color}`);
  if (!c.segs && !c.look && !c.mark) err(w, '矢印（segs / look / mark）が無い');
  (c.segs || []).flat().forEach((l) => { if (!isLane(l)) err(w, `segs の場所が不正: ${l}`); });
  [...(c.look || []), ...(c.on || []), ...(c.route || []).flat()].forEach((l) => { if (!isLane(l)) err(w, `場所が不正: ${l}`); });
  if (c.mark && !isLane(c.mark)) err(w, `mark の場所が不正: ${c.mark}`);
  [...(c.chips || []), ...(c.still || [])].forEach((id) => { if (!CHIPS.has(id)) err(w, `存在しない札: ${id}`); });
  (c.alts || []).forEach((a, i) => {
    if (!Array.isArray(a) || !a[0] || !a[1] || a.length > 4 || (a[3] !== undefined && a[3] !== 'cond')) err(w, `alts[${i}] が [コマンド, 説明, 前置き（任意）, 'cond'（任意）] ではない`);
  });
  if (c.level === 'basic' && LOCAL_INTEGRATE.test(c.cmd)) err(w, `早見表に手元で取り込むコマンドを置かない: ${c.cmd}`);
  if (PUSH_TO_START.test(c.cmd)) err(w, `本流・起点へ push するコマンドは載せない: ${c.cmd}`);
  scanStrings(w, c);
});
// 同じ結果の書き方は1行にまとめる。書き方をそろえて（switch ⇔ checkout など）、同じ操作の行が2つないかを見る
const SAME = [
  [/^git (?:checkout -b|switch -c) (\S+) origin\/\1$/, 'git switch $1'],
  [/^git (?:checkout|switch) -t origin\/(\S+)$/, 'git switch $1'],
  [/^git checkout -b /, 'git switch -c '],
  [/^git checkout -- /, 'git restore '],
  [/^git checkout (?!-)(\S+)$/, 'git switch $1'],
  [/^git reset HEAD (\S+)$/, 'git restore --staged $1'],
  [/ --cached\b/, ' --staged'],
  [/ --set-upstream\b/, ' -u'],
  [/^git fetch -p$/, 'git fetch --prune'],
  [/^git fetch origin$/, 'git fetch'],
  [/^git push origin \{mine\}$/, 'git push'],
  [/^(git fetch → )?git merge origin\//, 'git pull origin '],
];
const same = (cmd) => SAME.reduce((s, [re, to]) => s.replace(re, to), cmd);
const seen = new Map();
COMMANDS.forEach((c) => {
  const k = same(c.cmd);
  if (seen.has(k)) err(`コマンド ${c.id}`, `${seen.get(k)} と同じ結果のコマンドが別の行になっている（alts で1行にまとめる）: ${c.cmd}`);
  else seen.set(k, c.id);
  (c.alts || []).forEach(([a, , , kind]) => {
    if (same(a) !== a && same(a) !== k) err(`コマンド ${c.id}`, `別の書き方 ${a} が、この行のコマンドと同じ結果にならない`);
    // 条件つきの書き方は、同じ文字列が別の場面の行（応用編など）になっていてよい
    if (kind !== 'cond' && COMMANDS.some((o) => o.cmd === a)) err(`コマンド ${c.id}`, `別の書き方 ${a} が、別の行にもある`);
  });
});

PATTERNS.forEach((p) => {
  const pw = `パターン ${p.id}`;
  scanStrings(pw, p);
  Object.entries(p.commits).forEach(([id, c]) => {
    if (!p.rows[c.row]) err(pw, `${id} の row が無い: ${c.row}`);
    (c.parents || []).forEach((par) => { if (!p.commits[par]) err(pw, `${id} の親が無い: ${par}`); });
  });
  const check = (where, s) => {
    s.commits.forEach((id) => {
      if (!p.commits[id]) return err(where, `存在しないコミット: ${id}`);
      (p.commits[id].parents || []).forEach((par) => { if (!s.commits.includes(par)) err(where, `${id} の親 ${par} が図に無い`); });
    });
    const names = s.labels.map(([t]) => t.replace(/^HEAD → /, ''));
    if (new Set(names).size !== names.length) err(where, '同じブランチの札が2枚ある');
    s.labels.forEach(([t, c, k]) => {
      if (!s.commits.includes(c)) err(where, `札 ${t} の指すコミット ${c} が図に無い`);
      if (!['head', 'local', 'track'].includes(k)) err(where, `札 ${t} の種類が不正: ${k}`);
    });
    if (s.labels.filter(([, , k]) => k === 'head').length !== 1) err(where, 'HEAD の札がちょうど1枚ではない');
    s.remote.forEach(([b, c]) => { if (c !== null && !p.commits[c]) err(where, `リモート ${b} の指すコミットが無い: ${c}`); });
    if (!s.files) err(where, 'files が無い');
  };
  ['note', 'commits', 'labels', 'remote', 'files'].forEach((k) => { if (!p.start[k]) err(pw, `start.${k} が無い`); });
  check(`${pw} はじめ`, p.start);
  let prev = p.start;
  p.steps.forEach((st, i) => {
    const w = `${pw} 手順${i + 1}`;
    if (!st.title || !st.text) err(w, 'title / text が無い');
    if (st.event) { if (!isLane(st.event) || !st.cmd) err(w, 'event の場所か cmd が不正'); }
    else if (!ids.has(st.use)) err(w, `存在しないコマンド: ${st.use}`);
    else {
      const used = [st.cmd || COMMANDS.find((c) => c.id === st.use).cmd, st.alt || ''];
      if (st.alt && same(st.alt) !== same(used[0])) err(w, `alt が手順のコマンドと同じ結果にならない: ${used.join(' / ')}`);
      if (used.some((x) => LOCAL_INTEGRATE.test(x))) err(w, `パターンで手元の merge / rebase / pull origin はしない（{start} には画面でマージして入れる）: ${used.join(' / ')}`);
      if (used.some((x) => PUSH_TO_START.test(x))) err(w, `パターンで本流・起点へ push しない: ${used.join(' / ')}`);
    }
    const base = st.before ? { ...prev, ...st.before } : prev;
    const cur = { ...base };
    ['commits', 'labels', 'remote', 'files'].forEach((k) => { if (st[k] !== undefined) cur[k] = st[k]; });
    if (st.before) check(`${w}（前）`, base);
    check(w, cur);
    prev = cur;
  });
});

// 初期値で差し込んだとき、記号が残らないこと
const n = resolveNames(NAME_DEFAULTS);
const strings = JSON.stringify([COMMANDS, PATTERNS]).match(/"(?:[^"\\]|\\.)*"/g).map((s) => fillText(JSON.parse(s), n));
const leftover = strings.find((s) => /\{(base|start|mine|mate|startNote|cloneNote)\}/.test(s));
if (leftover) err('差し込み', `置き換わらずに残った: ${leftover.slice(0, 60)}`);

if (errors.length) {
  console.error(`データの問題 ${errors.length} 件:\n` + errors.map((e) => `  ✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`データチェック OK（コマンド ${COMMANDS.length} 個：基本 ${COMMANDS.filter((c) => c.level === 'basic').length}・応用 ${COMMANDS.filter((c) => c.level === 'advanced').length} / パターン ${PATTERNS.length} 個・手順 ${PATTERNS.reduce((k, p) => k + p.steps.length, 0)} 個）`);
