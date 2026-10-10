// 公開してよい内容かを調べる（GitHub で公開する前提）。
//  1. メールアドレス: 例示用（example.com）と GitHub の匿名アドレス以外があれば止める
//  2. PC のパス（ホームフォルダの絶対パスなど）が入っていたら止める
//  3. .private-words（手元だけに置く。Git には入れない）に書いた言葉が入っていたら止める
// 使い方: node scripts/check-public.mjs   （問題なければ exit 0）
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
const problems = [];
const ALLOWED_EMAIL = /@example\.com$|@users\.noreply\.github\.com$/i;

if (git('ls-files', '--cached', '.private-words').trim()) problems.push('.private-words が Git に入っています（.gitignore を確認）');
const wordsFile = new URL('.private-words', root);
const words = existsSync(wordsFile)
  ? readFileSync(wordsFile, 'utf8').split('\n').map((w) => w.trim()).filter((w) => w && !w.startsWith('#'))
  : null;

for (const f of files) {
  readFileSync(new URL(f, root), 'utf8').split('\n').forEach((line, i) => {
    const at = `${f}:${i + 1}`;
    for (const [mail] of line.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (!ALLOWED_EMAIL.test(mail)) problems.push(`${at}: メールアドレス ${mail}`);
    }
    if (/\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\/.test(line)) problems.push(`${at}: PC のパス`);
    // 言葉そのものは表示しない（ログに残さないため）。何行目の言葉かだけ出す
    (words || []).forEach((w, k) => { if (line.toLowerCase().includes(w.toLowerCase())) problems.push(`${at}: 公開しない言葉（.private-words の ${k + 1} 個目）`); });
  });
}

console.log(`調べたファイル: ${files.length} 個`);
if (!words) console.log('注意: .private-words が無いので、言葉のチェックはしていません（メールとパスだけ調べました）');
if (problems.length) {
  console.error(`公開前に直すもの ${problems.length} 件:\n` + problems.map((p) => `  ✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('公開前チェック OK');
