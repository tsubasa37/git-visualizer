// ブランチ名の設定（本流・起点・自分・ほかの人）の判定と、説明文への差し込み。
// 画面（DOM）を使わないので、node から検証できる（scripts/check-branch-names.mjs）。

const NAME_DEFAULTS = { base: 'master', startMode: 'same', startOther: 'develop', mine: 'feature/login-form', mate: 'feature/profile-page' };

// git check-ref-format --branch と同じ判定。使えない名前なら理由を、使えるなら '' を返す
function checkBranchName(name) {
  if (!name) return '名前を入れてください';
  if (name === 'HEAD') return '「HEAD」はブランチ名に使えません';
  if (name.startsWith('-')) return '先頭に「-」は使えません';
  if (/[\x00-\x20\x7f]/.test(name)) return 'スペースや制御文字は使えません';
  if (/[~^:?*[\\]/.test(name)) return '使えない記号（~ ^ : ? * [ \\）が入っています';
  if (name.includes('..')) return '「..」は使えません';
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) return '「/」の位置が正しくありません（先頭・末尾・連続は不可）';
  if (name.endsWith('.')) return '末尾に「.」は使えません';
  if (name.includes('@{')) return '「@{」は使えません';
  if (name.split('/').some((p) => p.startsWith('.') || p.endsWith('.lock'))) return '「.」で始まる区切りや「.lock」で終わる区切りは使えません';
  return '';
}

// 使えるが、チームではあまりしない名前への注意
function branchNameWarning(name) {
  if (name === '@') return '使えますが、git では「@」が HEAD（いまの位置）の意味にもなるので紛らわしい名前です';
  if (/[^\x21-\x7e]/.test(name)) return '日本語や全角の文字も使えますが、英小文字・数字・ハイフンにするのが一般的です';
  if (/[A-Z]/.test(name)) return '大文字も使えますが、英小文字にするのが一般的です';
  return '';
}

// 設定をまとめて確かめる。errors があれば反映しない
function validateSettings(s) {
  const errors = {}, warnings = {};
  const start = s.startMode === 'other' ? s.startOther : s.base;
  const field = (key, value, others) => {
    const e = checkBranchName(value) || (others.find(([v]) => v === value) || [])[1];
    if (e) errors[key] = e;
    else if (branchNameWarning(value)) warnings[key] = branchNameWarning(value);
  };
  if (s.base !== 'master' && s.base !== 'main') errors.base = '本流は master か main から選んでください';
  if (s.startMode !== 'same' && s.startMode !== 'other') errors.start = '起点の選び方が正しくありません';
  if (s.startMode === 'other') field('start', s.startOther, [[s.mine, 'あなたのブランチと同じ名前です'], [s.mate, 'ほかの人のブランチと同じ名前です']]);
  field('mine', s.mine, [[s.base, '本流と同じ名前です。作業用には別の名前を付けます'], [start, '起点ブランチと同じ名前です。作業用には別の名前を付けます'], [s.mate, 'ほかの人のブランチと同じ名前です']]);
  field('mate', s.mate, [[s.base, '本流と同じ名前です'], [start, '起点ブランチと同じ名前です'], [s.mine, 'あなたのブランチと同じ名前です']]);
  return { errors, warnings, ok: Object.keys(errors).length === 0 };
}

function resolveNames(s) {
  const start = s.startMode === 'other' ? s.startOther : s.base;
  return { base: s.base, start, mine: s.mine, mate: s.mate, sameStart: start === s.base };
}

const escHTML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// {base} {start} {mine} {mate} と、起点が本流と違うときだけ出る補足を差し込む
function fillNames(str, n, escapeFn) {
  const vals = {
    base: n.base, start: n.start, mine: n.mine, mate: n.mate,
    startNote: n.sameStart ? '' : `（clone した直後は、リモートの既定のブランチにいます。${n.start} でなければ git switch ${n.start} で移ります）`,
    cloneNote: n.sameStart ? '' : `起点の ${n.start} が既定のブランチでなければ、このあと git switch ${n.start} で移ります。`,
  };
  return String(str).replace(/\{(base|start|mine|mate|startNote|cloneNote)\}/g, (_, k) => escapeFn(vals[k]));
}
const fillText = (str, n) => fillNames(str, n, (v) => v);
const fillHTML = (str, n) => fillNames(str, n, escHTML);
