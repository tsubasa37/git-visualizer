// ブランチ名の判定（js/branch-names.js）が、本物の git check-ref-format --branch と一致するかを確かめる。
// あわせて、設定のまとめ判定と、説明文への差し込み（HTML の無害化）も確かめる。
// 使い方: node scripts/check-branch-names.mjs   （全部通れば exit 0）
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const code = readFileSync(new URL('../js/branch-names.js', import.meta.url), 'utf8');
const B = runInNewContext(`${code}\n;({ checkBranchName, validateSettings, resolveNames, fillText, fillHTML, NAME_DEFAULTS })`);

let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log(`  ✓ ${msg}`); };
const ng = (msg) => { fail++; console.log(`  ✗ ${msg}`); };
const expect = (msg, cond) => (cond ? ok(msg) : ng(msg));

// git リポジトリの外（使い捨てフォルダ）で、個人設定なしに判定させる
const cwd = mkdtempSync(join(tmpdir(), 'git-visualizer-names-'));
const gitSays = (name) => spawnSync('git', ['check-ref-format', '--branch', name], { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).status === 0;

console.log('■ git check-ref-format --branch との一致');
const names = [
  'feature/login-form', 'fix/broken-header', 'refactor/admin-list-parts', 'develop', 'main', 'master', 'release/2026-10',
  'feature/ユーザー登録', 'Feature/Login', 'a/b/c', 'feature/a.b', 'feature/v1.2', 'x', 'feature_x', 'feat/#123-login', 'a@b', 'feature/a-',
  'feature/my test', 'feature\tx', 'feature..x', '-x', 'feature/', '/x', 'a//b', 'x.', 'x.lock', 'a/x.lock/b', 'a/.b', '.a',
  '@', 'a@{b', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'HEAD', 'a\u007fb', 'feature/<b>',
];
for (const n of names) {
  const js = B.checkBranchName(n) === '';
  const git = gitSays(n);
  expect(`${JSON.stringify(n)}: git=${git ? '使える' : '使えない'} / サイト=${js ? '使える' : `使えない（${B.checkBranchName(n)}）`}`, js === git);
}

console.log('\n■ 設定のまとめ判定');
const D = { ...B.NAME_DEFAULTS };
expect('初期値はそのまま使える', B.validateSettings(D).ok);
expect('本流 main・起点 develop も使える', B.validateSettings({ ...D, base: 'main', startMode: 'other', startOther: 'develop' }).ok);
expect('自分のブランチ名が本流と同じなら止める', !B.validateSettings({ ...D, mine: 'master' }).ok);
expect('自分のブランチ名が起点と同じなら止める', !B.validateSettings({ ...D, startMode: 'other', startOther: 'develop', mine: 'develop' }).ok);
expect('自分とほかの人が同じ名前なら止める', !B.validateSettings({ ...D, mate: D.mine }).ok);
expect('本流は master / main 以外を受け付けない', !B.validateSettings({ ...D, base: 'trunk' }).ok);
expect('使えない名前は理由つきで止める', B.validateSettings({ ...D, mine: 'feature/my test' }).errors.mine === 'スペースや制御文字は使えません');
expect('「@」だけの名前は、反映はするが注意を出す', (() => { const r = B.validateSettings({ ...D, mine: '@' }); return r.ok && !!r.warnings.mine; })());
expect('日本語の名前は、反映はするが注意を出す', (() => { const r = B.validateSettings({ ...D, mine: 'feature/ユーザー登録' }); return r.ok && !!r.warnings.mine; })());

console.log('\n■ 説明文への差し込み');
const n1 = B.resolveNames({ ...D, base: 'main', startMode: 'other', startOther: 'develop', mine: 'feature/login-page' });
expect('{start} と {mine} が置き換わる', B.fillText('git pull origin {start} → {mine}', n1) === 'git pull origin develop → feature/login-page');
expect('起点が本流と違うときだけ補足が出る', B.fillText('{cloneNote}', n1).includes('develop') && B.fillText('{cloneNote}', B.resolveNames(D)) === '');
expect('知らない {…} はそのまま残す（stash@{0} など）', B.fillText('stash@{0}', n1) === 'stash@{0}');
expect('HTML に入れるときは名前を無害化する', B.fillHTML('<code>{mine}</code>', B.resolveNames({ ...D, mine: 'feature/<b>' })) === '<code>feature/&lt;b&gt;</code>');

console.log(`\n結果: ${pass} 件 OK / ${fail} 件 NG`);
process.exit(fail ? 1 : 0);
