#!/bin/bash
# サイトに書いた Git の挙動を、使い捨てのリポジトリで実際に確かめる。
# 使い方: bash scripts/verify-git.sh   （全部通れば exit 0、1つでも違えば exit 1）
set -u
WORK=$(mktemp -d "${TMPDIR:-/tmp}/git-visualizer-verify.XXXXXX") || exit 1
cd "$WORK" || exit 1
# 個人の git 設定に左右されないよう、設定なし・英語メッセージで動かす
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_EDITOR=true LC_ALL=C

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
ng(){ FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; if [ -n "${2:-}" ]; then printf '%s\n' "$2" | head -8 | sed 's/^/      | /'; fi; }
has(){ if printf '%s' "$2" | grep -qF -- "$3"; then ok "$1"; else ng "$1 （期待: $3）" "$2"; fi; }
hasi(){ if printf '%s' "$2" | grep -qiF -- "$3"; then ok "$1"; else ng "$1 （期待: $3）" "$2"; fi; }
hasnt(){ if printf '%s' "$2" | grep -qF -- "$3"; then ng "$1 （出てはいけない: $3）" "$2"; else ok "$1"; fi; }
eq(){ if [ "$2" = "$3" ]; then ok "$1"; else ng "$1 （期待: $3 / 実際: $2）"; fi; }
ne(){ if [ "$2" != "$3" ]; then ok "$1"; else ng "$1 （同じになってはいけない: $2）"; fi; }
anc(){ if git -C "$WORK/you" merge-base --is-ancestor "$2" "$3"; then ok "$1"; else ng "$1"; fi; }
sec(){ printf '\n■ %s\n' "$*"; }
you(){ git -C "$WORK/you" -c user.name=you -c user.email=you@example.com "$@"; }
other(){ git -C "$WORK/other" -c user.name=other -c user.email=other@example.com "$@"; }   # チームのほかの人
lab(){ git -C "$WORK/server" -c user.name=server -c user.email=server@example.com "$@"; } # 画面でのマージ操作の代わり
rev(){ you rev-parse --short "$1"; }
cur(){ you branch --show-current; }
exists(){ [ -e "$WORK/you/$1" ] && echo あり || echo なし; }
parents(){ you rev-list --parents -n1 HEAD | wc -w | tr -d ' '; }
F=feature/login-form

sec "0. git init の既定ブランチ名"
git init -q "$WORK/plain" 2>/dev/null
eq "設定なしの git init は master から始まる" "$(git -C "$WORK/plain" symbolic-ref --short HEAD)" "master"

sec "1. clone"
git init -q --bare -b master "$WORK/origin.git"
git clone -q "$WORK/origin.git" "$WORK/seed" 2>/dev/null
(
  cd "$WORK/seed" || exit 1
  printf '<h1>ログイン</h1>\n' > login.html
  printf 'console.log(1)\n' > app.js
  printf '<header></header>\n' > header.html; printf 'logo\n' > old-logo.png; printf 'body{}\n' > style.css
  git add . && git -c user.name=seed -c user.email=seed@example.com commit -qm "トップページを作成" && git push -q origin master
)
for who in you other server; do git clone -q "$WORK/origin.git" "$WORK/$who" 2>/dev/null; done
eq "clone 直後は master にいる" "$(cur)" "master"
has "clone で写し origin/master ができる" "$(you branch -a)" "remotes/origin/master"
has "clone した master は origin/master を追跡している" "$(you branch -vv)" "[origin/master]"
# 本流が main・起点が develop のリポジトリ（設定で名前を変えたとき）。push を使わず、bare で複製して作る
git init -q -b main "$WORK/seed-main"
( cd "$WORK/seed-main" && printf 'top\n' > index.html && git add . && git -c user.name=seed -c user.email=seed@example.com commit -qm "トップページを作成" && git branch develop )
git clone -q --bare "$WORK/seed-main" "$WORK/origin-main.git"
git clone -q "$WORK/origin-main.git" "$WORK/you-main" 2>/dev/null
eq "本流が main のリポジトリを clone すると main にいる" "$(git -C "$WORK/you-main" branch --show-current)" "main"
git clone -q --bare "$WORK/seed-main" "$WORK/origin-dev.git"; git -C "$WORK/origin-dev.git" symbolic-ref HEAD refs/heads/develop
git clone -q "$WORK/origin-dev.git" "$WORK/you-dev" 2>/dev/null
eq "clone 直後は、リモートの既定のブランチにいる（既定が develop なら develop）" "$(git -C "$WORK/you-dev" branch --show-current)" "develop"
out=$(git -C "$WORK/you-main" switch develop 2>&1)
has "起点の develop へは git switch develop で移れる（追跡も自動で設定）" "$out" "set up to track 'origin/develop'"

sec "2. パターン1: master を最新にして、ブランチを切って、push -u"
printf 'profile\n' > "$WORK/other/profile.html"; other add .; other commit -qm "プロフィール画面を追加"; other push -q origin master
out=$(you pull 2>&1); has "master で git pull すると origin/master に追いつく（fast-forward・設定なしでも止まらない）" "$out" "Fast-forward"
eq "pull 後、master と origin/master が同じ" "$(rev master)" "$(rev origin/master)"
printf 'wip\n' >> "$WORK/you/login.html"
you switch -q -c $F
eq "switch -c で新しいブランチに移る" "$(cur)" "$F"
has "switch -c は未コミットの変更を持ち越す" "$(you status --short)" " M login.html"
eq "切った直後のブランチは master と同じコミットを指す" "$(rev HEAD)" "$(rev master)"
you add login.html; you commit -qm "ログインフォームを追加"
ne "commit で $F が進む" "$(rev $F)" "$(rev master)"
eq "commit しても master は動かない" "$(rev master)" "$(rev origin/master)"
has "git status の1行目にいまいるブランチが出る" "$(you status)" "On branch $F"
out=$(you push 2>&1); has "-u なしの初回 push は upstream が無いと止まる" "$out" "has no upstream branch"
has "（そのとき Git は --set-upstream の書き方を案内する）" "$out" "git push --set-upstream origin $F"
out=$(you pull 2>&1); has "追跡先の無いブランチで git pull すると止まる" "$out" "There is no tracking information for the current branch"
out=$(you push -u origin $F 2>&1); has "push -u で追跡先が設定される" "$out" "set up to track 'origin/$F'"
has "branch -vv に追跡先が出る" "$(you branch -vv)" "[origin/$F]"
# 擬似端末（pty）で動かし、出力を最後まで読む（script コマンドは取りこぼすことがあるため使わない）
out=$(python3 - "$WORK/you" <<'PYTTY'
import os, pty, subprocess, sys
master, slave = pty.openpty()
p = subprocess.Popen(['git', '--no-pager', '-C', sys.argv[1], '-c', 'color.ui=false', 'log', '--oneline', '-1'],
                     stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
data = b''
while True:
    try:
        chunk = os.read(master, 4096)
    except OSError:
        break
    if not chunk:
        break
    data += chunk
p.wait()
sys.stdout.write(data.decode('utf-8', 'replace'))
PYTTY
)
has "ターミナルでは log --oneline にブランチの札が出る" "$out" "HEAD -> $F"
printf 'api\n' >> "$WORK/you/app.js"; you commit -qam "ログインの処理を追加"
has "push 前は status に ahead が出る" "$(you status)" "Your branch is ahead of 'origin/$F' by 1 commit."
has "branch -vv にも ahead が出る" "$(you branch -vv)" "ahead 1"
you push -q
eq "2回目からは git push だけで送れる" "$(rev $F)" "$(rev origin/$F)"

sec "3. fetch と、応用編: 自分のブランチに master の最新を取り込む（pull origin master ／ fetch → merge origin/master）"
other pull -q; printf 'news\n' > "$WORK/other/news.html"; other add .; other commit -qm "お知らせ欄を追加"; other push -q origin master
bh=$(rev HEAD); bm=$(rev master)
you fetch -q
ne "fetch で origin/master（写し）が進む" "$(rev origin/master)" "$bm"
eq "fetch しても自分の master は動かない" "$(rev master)" "$bm"
eq "fetch しても自分のブランチは動かない" "$(rev HEAD)" "$bh"
eq "fetch しても作業フォルダは変わらない" "$(exists news.html)" "なし"
out=$(you pull origin master 2>&1); rc=$?
has "設定なしで分岐していると pull origin master は止まる" "$out" "Need to specify how to reconcile divergent branches"
ne "止まったときは終了コードが 0 以外" "$rc" "0"
eq "止まったときは何も変わらない" "$(rev HEAD)" "$bh"
eq "（止まっても fetch は済んでいて、写し origin/master は進んでいる）" "$(rev origin/master)" "$(git -C "$WORK/origin.git" rev-parse --short master)"
you -c pull.rebase=false pull -q --no-edit origin master
eq "pull origin master の後も、いまいるブランチは $F" "$(cur)" "$F"
eq "取り込み結果はマージコミット（親が2つ）" "$(parents)" "3"
eq "pull origin master でも手元の master は古いまま" "$(rev master)" "$bm"
eq "写し origin/master は更新されている" "$(rev origin/master)" "$(git -C "$WORK/origin.git" rev-parse --short master)"
eq "master の変更が作業フォルダに入る" "$(exists news.html)" "あり"
you push -q
eq "push でリモートのブランチも進む" "$(rev origin/$F)" "$(rev HEAD)"
other pull -q; printf 'terms\n' > "$WORK/other/terms.html"; other add .; other commit -qm "利用規約を追加"; other push -q origin master
you fetch -q; you merge -q --no-edit origin/master
eq "fetch 後の git merge origin/master は、pull.rebase の設定なしでも止まらずに取り込める" "$(parents)" "3"
has "merge origin/master のマージコミットは文面が違う" "$(you log -1 --format=%s)" "Merge remote-tracking branch 'origin/master'"
you push -q

sec "4. パターン3: ほかの人のブランチを switch で持ってくる"
other switch -q -c feature/profile-page; printf 'page\n' > "$WORK/other/profile-page.html"; other add .; other commit -qm "プロフィール画面を追加"; other push -q -u origin feature/profile-page
out=$(you switch feature/profile-page 2>&1); has "fetch 前はほかの人のブランチに切り替えられない" "$out" "invalid reference"
you fetch -q
has "fetch で写し origin/feature/profile-page が来る" "$(you branch -a)" "remotes/origin/feature/profile-page"
out=$(you switch feature/profile-page 2>&1)
has "写しと同じ名前で switch すると、追跡つきのブランチが自動で作られる" "$out" "set up to track 'origin/feature/profile-page'"
eq "ほかの人のブランチに移れる" "$(cur)" "feature/profile-page"
eq "ほかの人のファイルが作業フォルダに出る" "$(exists profile-page.html)" "あり"
you switch -q $F
eq "自分のブランチに戻れる" "$(cur)" "$F"
eq "戻るとほかの人のファイルは見えなくなる" "$(exists profile-page.html)" "なし"
printf 'draft\n' > "$WORK/you/draft.html"; you switch -q master
eq "コミットしていない新しいファイルは、switch しても見えたまま" "$(exists draft.html)" "あり"
rm "$WORK/you/draft.html"; you switch -q $F

sec "4b. パターン3: fetch して checkout で持ってくる（早見表の別の書き方）"
other switch -q master; other pull -q
other switch -q -c feature/news-page; printf 'np\n' > "$WORK/other/news-page.html"; other add .; other commit -qm "お知らせページを追加"; other push -q -u origin feature/news-page
other switch -q master
other switch -q -c feature/help-page; printf 'hp\n' > "$WORK/other/help-page.html"; other add .; other commit -qm "ヘルプページを追加"; other push -q -u origin feature/help-page
other switch -q master
out=$(you checkout -b feature/news-page origin/feature/news-page 2>&1)
has "fetch 前は checkout -b 名前 origin/名前 もできない（写しが無い）" "$out" "is not a commit"
out=$(you checkout feature/help-page 2>&1); rc=$?
has "fetch 前は git checkout 名前 もできない（写しが無い）" "$out" "did not match any file(s) known to git"
ne "（終了コードが 0 以外）" "$rc" "0"
you fetch -q
out=$(you checkout -b feature/news-page origin/feature/news-page 2>&1)
has "checkout -b 名前 origin/名前 で、追跡つきのブランチができる" "$out" "set up to track 'origin/feature/news-page'"
eq "（そのブランチに移っている）" "$(cur)" "feature/news-page"
eq "（中身も入る）" "$(exists news-page.html)" "あり"
printf 'np2\n' >> "$WORK/you/news-page.html"; you commit -qam "続きの作業"
out=$(you push 2>&1); rc=$?
eq "checkout -b で持ってきたブランチは、-u なしの git push で送れる" "$rc" "0"
eq "（リモートのそのブランチが進む）" "$(rev origin/feature/news-page)" "$(rev HEAD)"
you switch -q -c feature/news-sub
eq "持ってきたブランチから切ると、その先頭から始まる" "$(rev HEAD)" "$(rev feature/news-page)"
printf 'sub\n' > "$WORK/you/news-sub.html"; you add news-sub.html; you commit -qm "設定画面を追加"
anc "（ほかの人の変更の続きになっている）" origin/feature/news-page HEAD
out=$(you push -u origin feature/news-sub 2>&1); has "自分のブランチは push -u で送る" "$out" "set up to track 'origin/feature/news-sub'"
you switch -q feature/news-page
out=$(you checkout feature/help-page 2>&1)
has "git checkout 名前 だけでも、同じ名前の写しがあれば追跡つきで作られる" "$out" "set up to track 'origin/feature/help-page'"
you checkout -q -b my-news origin/feature/news-page
out=$(you push 2>&1); rc=$?
has "ローカルの名前をリモートと変えると、引数なしの push は止まる" "$out" "The upstream branch of your current branch does not match"
ne "（終了コードが 0 以外）" "$rc" "0"
you checkout -q $F
eq "git checkout 名前 で自分のブランチに戻れる" "$(cur)" "$F"
printf 'wip2\n' >> "$WORK/you/login.html"; you checkout -q -b feature/checkout-test
has "checkout -b も未コミットの変更を持ち越す" "$(you status --short)" " M login.html"
eq "（checkout -b は、いまの位置から切る）" "$(rev HEAD)" "$(rev $F)"
you restore login.html; you switch -q $F; you branch -q -D feature/checkout-test my-news

sec "4c. リモートのブランチを持ってくるときの落とし穴（早見表の注意書き）"
other switch -q master; other pull -q
other switch -q -c feature/mypage; printf 'v1\n' > "$WORK/other/mypage.html"; other add .; other commit -qm "マイページ v1"; other push -q -u origin feature/mypage
you switch -q master; you fetch -q
you checkout -q -b feature/mypage
eq "origin/… を書かない checkout -b は、いまいるブランチ（master）から切るだけ" "$(rev HEAD)" "$(rev master)"
eq "（リモートの中身は入らない）" "$(exists mypage.html)" "なし"
hasnt "（追跡先も付かない）" "$(you branch -vv | grep '^\*')" "[origin/"
you switch -q master
out=$(you switch feature/mypage 2>&1)
hasnt "手元に同じ名前があると、git switch 名前 は写しから作らない（set up to track が出ない）" "$out" "set up to track"
eq "（手元のブランチに移るだけで、リモートの中身は入らない）" "$(exists mypage.html)" "なし"
you switch -q master
out=$(you checkout feature/mypage 2>&1)
hasnt "git checkout 名前 も同じ（set up to track が出ない）" "$out" "set up to track"
eq "（リモートの中身は入らない）" "$(exists mypage.html)" "なし"
you switch -q master
out=$(you switch -c feature/mypage origin/feature/mypage 2>&1); rc=$?
has "switch -c 名前 origin/名前 は、手元に同じ名前があると止まる（黙って古いほうへ移らない）" "$out" "already exists"
ne "（終了コードが 0 以外）" "$rc" "0"
out=$(you checkout -b feature/mypage origin/feature/mypage 2>&1)
has "checkout -b 名前 origin/名前 も同じく止まる" "$out" "already exists"
out=$(you branch -d feature/mypage 2>&1)
has "間違えて作ったブランチは、master で branch -d して消せる" "$out" "Deleted branch feature/mypage"
out=$(you switch -c feature/mypage origin/feature/mypage 2>&1)
has "switch -c 名前 origin/名前 で、追跡つきのブランチができる" "$out" "set up to track 'origin/feature/mypage'"
eq "（リモートの中身が入る）" "$(exists mypage.html)" "あり"
printf 'v1b\n' >> "$WORK/you/mypage.html"; you commit -qam "マイページの続き"
out=$(you push 2>&1); rc=$?
eq "switch -c 名前 origin/名前 で作ったブランチは、-u なしの git push で送れる" "$rc" "0"
other switch -q feature/mypage; other pull -q; printf 'v2\n' >> "$WORK/other/mypage.html"; other commit -qam "マイページ v2"; other push -q
you switch -q master; you branch -q -D feature/mypage
you switch -q -c feature/mypage origin/feature/mypage
ne "fetch していないと、古い写しから作られる（リモートの最新が入らない）" "$(rev HEAD)" "$(git -C "$WORK/origin.git" rev-parse --short feature/mypage)"
you switch -q master; you branch -q -D feature/mypage; you fetch -q
you switch -q -c feature/mypage origin/feature/mypage
eq "直前に fetch すれば、リモートの最新から作られる" "$(rev HEAD)" "$(git -C "$WORK/origin.git" rev-parse --short feature/mypage)"
you switch -q master; you switch -q -c feature/mistake; printf 'm\n' > "$WORK/you/mistake.txt"; you add mistake.txt; you commit -qm "消えては困るコミット"; you switch -q master
out=$(you branch -d feature/mistake 2>&1); rc=$?
has "いまいるブランチに入っていないコミットがあると、branch -d は消さずに止まる" "$out" "not fully merged"
ne "（終了コードが 0 以外）" "$rc" "0"
you branch -q -D feature/mistake; other switch -q master
other switch -q -c feature/mypage-c; printf 'c\n' > "$WORK/other/mypage-c.html"; other add .; other commit -qm "マイページ c"; other push -q -u origin feature/mypage-c; other switch -q master
you switch -q master; you fetch -q
you switch -q -c feature/mypage-c
eq "origin/… を書かない switch -c も、いまいるブランチ（master）から切るだけ" "$(rev HEAD)" "$(rev master)"
eq "（リモートの中身は入らない）" "$(exists mypage-c.html)" "なし"
you switch -q master; you branch -q -D feature/mypage-c
out=$(you switch feature/mypage-c 2>&1)
has "リモートにしか無いブランチは、名前だけの git switch でリモートから作られる" "$out" "set up to track 'origin/feature/mypage-c'"
eq "（リモートの中身が入る）" "$(exists mypage-c.html)" "あり"
# -t origin/名前 でも同じ名前のブランチが作られる（手元に同じ名前があると止まる）
you switch -q master; you branch -q -D feature/mypage-c
out=$(you switch -t origin/feature/mypage-c 2>&1)
has "git switch -t origin/名前 でも、同じ名前の追跡つきブランチができる" "$out" "set up to track 'origin/feature/mypage-c'"
eq "（手元のブランチ名は origin/ を外した名前）" "$(cur)" "feature/mypage-c"
eq "（リモートの中身が入る）" "$(exists mypage-c.html)" "あり"
you switch -q master
out=$(you switch -t origin/feature/mypage-c 2>&1); rc=$?
has "手元に同じ名前があると、switch -t は止まる" "$out" "already exists"
ne "（終了コードが 0 以外）" "$rc" "0"
you branch -q -D feature/mypage-c
out=$(you checkout -t origin/feature/mypage-c 2>&1)
has "git checkout -t origin/名前 でも、同じ名前の追跡つきブランチができる" "$out" "set up to track 'origin/feature/mypage-c'"
eq "（手元のブランチ名は origin/ を外した名前）" "$(cur)" "feature/mypage-c"
you switch -q master
out=$(you checkout -t origin/feature/mypage-c 2>&1); rc=$?
has "手元に同じ名前があると、checkout -t も止まる" "$out" "already exists"
# git switch 名前 はリモートに取りに行かず、fetch で届いた写しから作る
you switch -q master; you branch -q -D feature/mypage-c
you remote set-url origin "$WORK/nowhere.git"
out=$(you fetch 2>&1); rc=$?
ne "（確かめる準備: リモートに届かない状態にした＝fetch は失敗する）" "$rc" "0"
out=$(you switch feature/mypage-c 2>&1); rc=$?
eq "リモートに届かなくても、git switch 名前 は写しから作れる（リモートには取りに行かない）" "$rc" "0"
eq "（中身も写しのとおり入る）" "$(exists mypage-c.html)" "あり"
you remote set-url origin "$WORK/origin.git"
other switch -q feature/mypage-c; printf 'c2\n' >> "$WORK/other/mypage-c.html"; other commit -qam "マイページ c2"; other push -q; other switch -q master
you switch -q master; you branch -q -D feature/mypage-c
you switch -q feature/mypage-c
ne "fetch していないと、名前だけの git switch も古い写しから作られる（リモートの最新は入らない）" "$(rev HEAD)" "$(git -C "$WORK/origin.git" rev-parse --short feature/mypage-c)"
eq "（作られるのは写しと同じ位置）" "$(rev HEAD)" "$(rev origin/feature/mypage-c)"
you switch -q $F

sec "5. パターン4: 作業を退避して、master から急ぎの修正"
printf 'edit\n' >> "$WORK/you/login.html"
printf 'staged\n' >> "$WORK/you/app.js"; you add app.js
printf 'memo\n' > "$WORK/you/memo.txt"
you stash -q
eq "stash は変更を退避し、未追跡ファイルは残す" "$(you status --short)" "?? memo.txt"
eq "stash list に1件入る" "$(you stash list | wc -l | tr -d ' ')" "1"
you switch -q master; you pull -q
you switch -q -c fix/broken-header
eq "急ぎの修正ブランチは master から切られる" "$(rev HEAD)" "$(rev master)"
printf 'fixed\n' >> "$WORK/you/header.html"
you add header.html; you commit -qm "ヘッダーの崩れを修正"
eq "修正のコミットには header.html だけが入る（退避した作業途中の変更は混ざらない）" "$(you diff-tree --no-commit-id --name-only -r HEAD)" "header.html"
you push -q -u origin fix/broken-header
you switch -q $F
you stash pop -q
st=$(you status --short)
has "stash pop で未ステージの変更が戻る" "$st" " M login.html"
has "ステージ済みだった変更は未ステージで戻る" "$st" " M app.js"
eq "pop するとスタッシュから消える" "$(you stash list | wc -l | tr -d ' ')" "0"
you stash -q; you stash apply -q
eq "stash apply はスタッシュに残す" "$(you stash list | wc -l | tr -d ' ')" "1"
you stash drop -q; you add -A; you commit -qm "作業の続き"
printf 'n\n' > "$WORK/you/new-part.html"; you add new-part.html; you stash -q; you stash pop -q
has "新しく add したファイルは、stash pop でステージ済みのまま戻る" "$(you status --short)" "A  new-part.html"
you reset -q --hard
printf 'u\n' > "$WORK/you/untracked-new.txt"; you stash -q -u
eq "stash -u は未追跡のファイルも退避する" "$(exists untracked-new.txt)" "なし"
you stash pop -q
eq "（pop で戻る）" "$(exists untracked-new.txt)" "あり"
rm "$WORK/you/untracked-new.txt"
printf 'stashed\n' >> "$WORK/you/header.html"; you stash -q
printf 'committed\n' >> "$WORK/you/header.html"; you commit -qam "別の変更"
out=$(you stash pop 2>&1)
has "pop でぶつかるとコンフリクトになる" "$out" "CONFLICT"
eq "ぶつかったときはスタッシュが残る" "$(you stash list | wc -l | tr -d ' ')" "1"
you reset -q --hard; you stash drop -q
printf 'q\n' >> "$WORK/you/style.css"; you stash -q; you push -q
hasnt "stash はリモートに送られない" "$(git -C "$WORK/origin.git" show-ref)" "refs/stash"
you stash drop -q

sec "6. switch が拒否される / 変更を持ち越す"
printf 'conflict\n' >> "$WORK/you/login.html"
out=$(you switch master 2>&1); rc=$?
has "ぶつかる未コミットの変更があると switch は拒否される" "$out" "Your local changes to the following files would be overwritten by checkout"
ne "拒否されたときは終了コードが 0 以外" "$rc" "0"
you restore login.html
printf 'carry\n' >> "$WORK/you/style.css"
you switch -q master
has "ぶつからない変更は持ったまま switch できる" "$(you status --short)" " M style.css"
you restore style.css; you switch -q $F

sec "7. パターン2: レビューで直して push → 画面でマージ → master に移って pull"
you push -q
printf 'review\n' >> "$WORK/you/login.html"; you add login.html; you commit -qm "レビューの指摘を反映"
you push -q
eq "同じブランチに push すると、リモートのブランチ（プルリクエストが見ているもの）が進む" "$(git -C "$WORK/origin.git" rev-parse --short $F)" "$(rev HEAD)"
lab pull -q
lab merge -q --no-ff origin/$F -m "Merge pull request from $F"
lab push -q origin master
ne "画面でマージされても、手元の master にはまだ届いていない" "$(rev master)" "$(git -C "$WORK/origin.git" rev-parse --short master)"
you switch -q master
out=$(you pull 2>&1); has "master で pull すると、マージ結果が fast-forward で入る" "$out" "Fast-forward"
eq "（手元の master がリモートと同じになる）" "$(rev master)" "$(git -C "$WORK/origin.git" rev-parse --short master)"
anc "自分のコミット（レビューの修正も）が master に入っている" $F master

sec "7b. 応用編: 使い終わったブランチの片付け（branch -d / fetch --prune）"
lab push -q origin --delete $F
you switch -q $F
out=$(you branch -d $F 2>&1); hasi "いまいるブランチは消せない" "$out" "cannot delete branch"
you switch -q master
has "リモートで消えたブランチの写しは、まだ手元に残る" "$(you branch -a)" "remotes/origin/$F"
out=$(you branch -d $F 2>&1); has "マージ済みなら branch -d で消せる" "$out" "Deleted branch $F"
out=$(you fetch --prune 2>&1); has "fetch --prune で消えたブランチの写しが掃除される" "$out" "[deleted]"
hasnt "prune 後は写しも無い" "$(you branch -a)" "origin/$F"
you switch -q -c feature/squash-test; printf 's\n' > "$WORK/you/squash.txt"; you add squash.txt; you commit -qm "squash されるブランチ"; you push -q -u origin feature/squash-test
lab fetch -q; lab pull -q; lab merge -q --squash origin/feature/squash-test >/dev/null; lab commit -qm "squash されたPR"; lab push -q origin master; lab push -q origin --delete feature/squash-test
you switch -q master; you pull -q; you fetch -q --prune
out=$(you branch -d feature/squash-test 2>&1); rc=$?
has "squash マージして prune した後は、branch -d は not fully merged で止まる" "$out" "not fully merged"
ne "止まったときは終了コードが 0 以外" "$rc" "0"
out=$(you branch -D feature/squash-test 2>&1); has "-D なら消せる" "$out" "Deleted branch"
you switch -q -c feature/squash-test2; printf 's2\n' > "$WORK/you/squash2.txt"; you add squash2.txt; you commit -qm "squash されるブランチ2"; you push -q -u origin feature/squash-test2
lab fetch -q; lab pull -q; lab merge -q --squash origin/feature/squash-test2 >/dev/null; lab commit -qm "squash されたPR2"; lab push -q origin master; lab push -q origin --delete feature/squash-test2
you switch -q master; you pull -q
out=$(you branch -d feature/squash-test2 2>&1)
has "prune 前なら squash でも -d で消える（写し origin/… に入っているため）" "$out" "Deleted branch feature/squash-test2"
has "（そのとき HEAD には入っていないと警告が出る）" "$out" "not yet merged to HEAD"
you fetch -q --prune

sec "8. 応用編: pull origin master でコンフリクト（衝突）したときの直し方"
you switch -q -c $F
printf '<h1>ログイン（パスワード表示つき）</h1>\n' > "$WORK/you/login.html"; you commit -qam "見出しを変更"
other switch -q master; other pull -q; printf '<h1>サインイン</h1>\n' > "$WORK/other/login.html"; other commit -qam "見出しをサインインに変更"; other push -q origin master
out=$(you -c pull.rebase=false pull origin master 2>&1); rc=$?
has "同じ行を両方が変えると CONFLICT になる" "$out" "CONFLICT (content): Merge conflict in login.html"
ne "コンフリクト時は終了コードが 0 以外" "$rc" "0"
body=$(cat "$WORK/you/login.html")
has "衝突したファイルに <<<<<<< の印が入る" "$body" "<<<<<<< HEAD"
has "（>>>>>>> までが印）" "$body" ">>>>>>> "
printf '<h1>サインイン（パスワード表示つき）</h1>\n' > "$WORK/you/login.html"
you add login.html; you commit -q --no-edit
eq "直して add → commit --no-edit でマージが完了（親が2つ）" "$(parents)" "3"
has "pull origin master のマージコミットは Merge branch 'master' of …" "$(you log -1 --format=%s)" "Merge branch 'master' of"
out=$(you push -u origin $F 2>&1); rc=$?
eq "直した結果を push できる" "$rc" "0"

sec "9. 取り消し（早見表・応用編）"
printf 'memo2\n' > "$WORK/you/memo2.txt"; you add memo2.txt
has "status のヒントに restore --staged が出る" "$(you status)" 'git restore --staged <file>'
you restore --staged memo2.txt
has "restore --staged で add を取り消せる（ファイルは残る）" "$(you status --short)" "?? memo2.txt"
printf 'x\n' >> "$WORK/you/style.css"; you add style.css; you restore --staged style.css
has "restore --staged 後も作業フォルダの変更は残る" "$(you status --short)" " M style.css"
you restore style.css
hasnt "restore で作業フォルダの変更を捨てられる" "$(you status --short)" "style.css"
printf 'v1\n' >> "$WORK/you/style.css"; you add style.css; printf 'v2\n' >> "$WORK/you/style.css"; you restore style.css
eq "restore は add 済みの内容（ステージング）に戻す" "$(you diff --name-only)" ""
eq "（ステージングの変更は残る）" "$(you diff --staged --name-only)" "style.css"
eq "--cached は --staged と同じ" "$(you diff --cached --name-only)" "style.css"
you reset -q --hard
printf 'y\n' >> "$WORK/you/style.css"; you commit -qam "ボタンの文言（誤字あり）"
old=$(rev HEAD); parent=$(rev HEAD~1)
you commit -q --amend -m "ボタンの文言を修正"
ne "amend するとコミットの ID が変わる" "$(rev HEAD)" "$old"
eq "amend は直前のコミットを置き換える（親は同じ）" "$(rev HEAD~1)" "$parent"
you reset -q HEAD~1
eq "reset HEAD~1 で札が1つ前に戻る" "$(rev HEAD)" "$parent"
has "取り消したコミットの変更は作業フォルダに残る" "$(you status --short)" " M style.css"
eq "（ステージングは空）" "$(you diff --staged --name-only)" ""
you commit -qam "ボタンの文言を修正"
printf 'z\n' >> "$WORK/you/header.html"
printf 'u\n' > "$WORK/you/untracked.txt"; printf 'a\n' > "$WORK/you/added-new.txt"; you add added-new.txt
you reset -q --hard HEAD~1
eq "reset --hard で札が戻る" "$(rev HEAD)" "$parent"
hasnt "reset --hard で未コミットの変更も消える" "$(you status --short)" "header.html"
eq "reset --hard でも add していない新しいファイルは残る" "$(exists untracked.txt)" "あり"
eq "reset --hard で add しただけの新しいファイルは消える" "$(exists added-new.txt)" "なし"
rm "$WORK/you/untracked.txt"
printf 'bad\n' >> "$WORK/you/style.css"; you commit -qam "まずい変更"; you push -q
bad=$(rev HEAD); n1=$(you rev-list --count HEAD)
you revert --no-edit HEAD >/dev/null
eq "revert はコミットを1つ増やす" "$(you rev-list --count HEAD)" "$((n1+1))"
has "revert のメッセージ" "$(you log -1 --format=%s)" 'Revert "まずい変更"'
eq "revert 後の中身は、まずい変更の前と同じ" "$(you diff "$bad~1" HEAD -- style.css)" ""
anc "revert しても元のコミットは履歴に残る" "$bad" HEAD
you push -q
eq "revert は普通に push できる" "$(rev origin/$F)" "$(rev HEAD)"
you reset -q --hard "$bad~1"
out=$(you push 2>&1); has "push 済みのコミットを reset すると、普通の push は拒否される" "$out" "rejected"
you reset -q --hard origin/$F

sec "10. rebase / cherry-pick"
you switch -q master; you pull -q
you switch -q -c feature/rebase-test; printf 'mine\n' > "$WORK/you/mine.txt"; you add mine.txt; you commit -qm "自分の変更"; you push -q -u origin feature/rebase-test
other switch -q master; other pull -q; printf 'r\n' > "$WORK/other/rebase.txt"; other add .; other commit -qm "master の新しい変更"; other push -q origin master
you fetch -q; mine=$(rev HEAD)
you rebase -q origin/master
ne "rebase すると自分のコミットの ID が変わる" "$(rev HEAD)" "$mine"
anc "rebase 後は origin/master の先に並ぶ" origin/master HEAD
out=$(you push 2>&1); has "push 済みのブランチを rebase すると普通の push は拒否される" "$out" "rejected"
you push -q --force-with-lease; rc=$?; eq "--force-with-lease なら送れる" "$rc" "0"
pick=$(rev feature/rebase-test)
you switch -q -c feature/pick-target master
you cherry-pick "$pick" >/dev/null
ne "cherry-pick は同じ変更を別の ID でコピーする" "$(rev HEAD)" "$pick"
eq "コピーした変更の中身は同じ" "$(you show "$pick" | git patch-id --stable | cut -d' ' -f1)" "$(you show HEAD | git patch-id --stable | cut -d' ' -f1)"

sec "11. リモートの方が進んでいると push は拒否される"
other fetch -q; other switch -q feature/rebase-test; printf 's2\n' >> "$WORK/other/mine.txt"; other commit -qam "ほかの人が同じブランチに追加"; other push -q
other switch -q master; other pull -q; printf 'm\n' > "$WORK/other/master-new.txt"; other add master-new.txt; other commit -qm "master にも追加"; other push -q origin master
you switch -q feature/rebase-test
has "fetch していないと、リモートが進んでいても status は up to date と出る" "$(you status)" "Your branch is up to date with 'origin/feature/rebase-test'."
printf 'o\n' > "$WORK/you/other.txt"; you add other.txt; you commit -qm "自分も追加"
out=$(you push 2>&1)
has "リモートが先に進んでいると push は拒否される" "$out" "rejected"
has "ヒントは fetch first" "$out" "fetch first"
out=$(you pull 2>&1); has "引数なしの git pull も、分岐していると設定なしでは止まる" "$out" "Need to specify how to reconcile divergent branches"
you -c pull.rebase=false pull -q --no-edit
eq "引数なしの pull は、ほかの写し（origin/master）もまとめて更新する" "$(rev origin/master)" "$(git -C "$WORK/origin.git" rev-parse --short master)"
you push -q; rc=$?
eq "pull してから push すれば送れる" "$rc" "0"

sec "12. diff / rm / mv / add せずに commit / log"
printf 'a\n' >> "$WORK/you/style.css"; you add style.css; printf 'b\n' >> "$WORK/you/login.html"
eq "git diff は add していない変更だけ" "$(you diff --name-only)" "login.html"
eq "git diff --staged は次のコミットに入る変更だけ" "$(you diff --staged --name-only)" "style.css"
you reset -q --hard
printf 'c\n' >> "$WORK/you/style.css"
out=$(you commit -m "何も add していない" 2>&1); has "add していないと commit されない" "$out" "no changes added to commit"
you restore style.css
printf 'd\n' >> "$WORK/you/style.css"; you checkout -- style.css
hasnt "git checkout -- ファイル でも変更を捨てられる（restore と同じ）" "$(you status --short)" "style.css"
you rm -q old-logo.png
has "git rm は削除をステージする" "$(you status --short)" "D  old-logo.png"
eq "git rm でファイルも消える" "$(exists old-logo.png)" "なし"
you reset -q --hard
you mv style.css common.css
has "git mv は名前の変更をステージする" "$(you status --short)" "R  style.css -> common.css"
you reset -q --hard
rm "$WORK/you/old-logo.png"; you add old-logo.png
has "手で消してから add しても削除がステージされる" "$(you status --short)" "D  old-logo.png"
you reset -q --hard
mv "$WORK/you/style.css" "$WORK/you/common.css"; you add style.css common.css
has "手で名前を変えて両方 add しても名前の変更になる" "$(you status --short)" "R  style.css -> common.css"
you reset -q --hard
printf 'mod\n' >> "$WORK/you/old-logo.png"
out=$(you rm old-logo.png 2>&1); has "コミットしていない変更があると、git rm は止まる" "$out" "has local modifications"
rm "$WORK/you/old-logo.png"; you add old-logo.png
has "手で消して add すると、変更ごと削除がステージされる" "$(you status --short)" "D  old-logo.png"
you reset -q --hard
printf 'mod\n' >> "$WORK/you/style.css"; you mv style.css common.css
eq "コミットしていない変更があると、git mv はその変更を未ステージのまま残す" "$(you diff --name-only)" "common.css"
you reset -q --hard; rm -f "$WORK/you/common.css"
printf 'mod\n' >> "$WORK/you/style.css"; mv "$WORK/you/style.css" "$WORK/you/common.css"; you add style.css common.css
eq "手で名前を変えて add すると、変更ごとステージングに入る" "$(you diff --name-only)" ""
you reset -q --hard; rm -f "$WORK/you/common.css"
printf 'mod\n' >> "$WORK/you/style.css"; you add style.css; you mv style.css common.css
eq "（add 済みの変更は、git mv の後もステージングに入ったまま＝手で変えて add と同じ）" "$(you diff --name-only)" ""
you reset -q --hard; rm -f "$WORK/you/common.css"
printf 'mod2\n' >> "$WORK/you/old-logo.png"; you add old-logo.png
out=$(you rm old-logo.png 2>&1); has "add 済みの変更があっても、git rm は止まる" "$out" "has changes staged in the index"
you reset -q --hard
printf 'w\n' >> "$WORK/you/style.css"; you commit -qam "消える予定のコミット"; gone=$(you rev-parse HEAD)
you reset -q --hard HEAD~1
has "reset --hard で消したコミットも reflog には残る" "$(you reflog --format=%H)" "$gone"
printf 's1\n' >> "$WORK/you/style.css"; you add style.css; you stash -q; you stash pop -q --index
has "stash pop --index ならステージ済みのまま戻る" "$(you status --short)" "M  style.css"
you reset -q --hard
has "log --all には写し origin/… も出る" "$(you log --oneline --graph --all --decorate)" "origin/master"
you switch -q -c feature/from-feature
eq "別の作業ブランチにいて switch -c すると、そのブランチの位置から切られる" "$(rev HEAD)" "$(rev feature/rebase-test)"
ne "（master の位置ではない）" "$(rev HEAD)" "$(rev master)"
printf 'fixed2\n' >> "$WORK/you/header.html"; printf 'test\n' > "$WORK/you/header-test.html"
you commit -qam "文言を修正"
has "commit -a は新しいファイル（未追跡）を含めない" "$(you status --short)" "?? header-test.html"
has "commit -a は追跡中のファイルの変更を含める" "$(you diff-tree --no-commit-id --name-only -r HEAD)" "header.html"
rm "$WORK/you/header-test.html"

sec "13. 早見表・応用編の「別の書き方」が同じ結果になる"
you switch -q master; you pull -q
you switch -q -c feature/alt-check
you checkout -q master
eq "git checkout 名前 でも、switch と同じく移れる" "$(cur)" "master"
you checkout -q -b feature/alt-b
eq "git checkout -b でも、switch -c と同じく作って移れる" "$(cur)" "feature/alt-b"
eq "（いまの位置から切られる）" "$(rev HEAD)" "$(rev master)"
out=$(you push --set-upstream origin feature/alt-b 2>&1)
has "push --set-upstream でも追跡先が設定される（-u と同じ）" "$out" "set up to track 'origin/feature/alt-b'"
printf 'alt\n' > "$WORK/you/alt.txt"; you add alt.txt; you commit -qm "別の書き方の確認"
you push -q origin feature/alt-b
eq "git push origin 名前 でも、git push と同じく送れる" "$(git -C "$WORK/origin.git" rev-parse --short feature/alt-b)" "$(rev HEAD)"
printf 'st\n' >> "$WORK/you/style.css"; you add style.css; head=$(rev HEAD)
you reset -q HEAD style.css
eq "git reset HEAD ファイル でも add を取り消せる（restore --staged と同じ）" "$(you diff --staged --name-only)" ""
has "（作業フォルダの変更は残る）" "$(you status --short)" " M style.css"
eq "（ファイル名を付けた reset では、札は動かない）" "$(rev HEAD)" "$head"
you restore style.css
other switch -q master; other pull -q; other switch -q -c feature/alt-remote; printf 'r\n' > "$WORK/other/alt-remote.txt"; other add .; other commit -qm "リモートだけのブランチ"; other push -q -u origin feature/alt-remote
you fetch -q origin
has "git fetch origin でも写しが届く（git fetch と同じ）" "$(you branch -a)" "remotes/origin/feature/alt-remote"
other push -q origin --delete feature/alt-remote
out=$(you fetch -p 2>&1)
has "git fetch -p でも消えたブランチの写しが掃除される（--prune と同じ）" "$out" "[deleted]"
hasnt "（写しが無くなる）" "$(you branch -a)" "origin/feature/alt-remote"
you switch -q -c feature/alt-head
out=$(you push -u origin HEAD 2>&1)
has "git push -u origin HEAD でも、いまいるブランチが同じ名前で送られ、追跡先が付く" "$out" "set up to track 'origin/feature/alt-head'"
eq "（HEAD^ は HEAD~1 と同じコミット）" "$(you rev-parse HEAD^)" "$(you rev-parse HEAD~1)"
you switch -q master; you pull -q
you switch -q -c feature/no-u
out=$(you push origin feature/no-u 2>&1); rc=$?
eq "-u の前でも git push origin 名前 で送れる" "$rc" "0"
hasnt "（ただし追跡先は付かない）" "$(you branch -vv | grep '^\*')" "[origin/"
printf 'nu\n' > "$WORK/you/no-u.txt"; you add no-u.txt; you commit -qm "追跡なしのブランチ"; you push -q origin feature/no-u
you switch -q master
out=$(you branch -d feature/no-u 2>&1)
has "追跡の設定が無いと、写しに入っていても branch -d は止まる（いまいるブランチと比べる）" "$out" "not fully merged"
you branch -q -D feature/no-u
other fetch -q; other switch -q feature/alt-b; printf 'b2\n' >> "$WORK/other/alt.txt"; other commit -qam "alt-b に追加"; other push -q
other switch -q master; other pull -q; printf 'p\n' > "$WORK/other/pull-origin.txt"; other add .; other commit -qm "master に追加"; other push -q origin master
alt_before=$(rev origin/feature/alt-b)
out=$(you pull origin master 2>&1)
has "master にいるときの git pull origin master は、git pull と同じく最新になる" "$out" "Fast-forward"
eq "（手元の master がリモートと同じ）" "$(rev master)" "$(git -C "$WORK/origin.git" rev-parse --short master)"
eq "（ただし、ほかのブランチの写しは更新されない）" "$(rev origin/feature/alt-b)" "$alt_before"
you pull -q
ne "引数なしの git pull は、ほかのブランチの写しも更新する" "$(rev origin/feature/alt-b)" "$alt_before"

sec "14. 応用編の注意書き（revert のマージ・rebase の写し）"
lab fetch -q; lab switch -q master; lab pull -q
lab switch -q -c feature/revert-me; printf 'r\n' > "$WORK/server/revert-me.txt"; lab add revert-me.txt; lab commit -qm "取り消されるPR"
lab switch -q master; lab merge -q --no-ff feature/revert-me -m "Merge pull request from feature/revert-me"; lab push -q origin master
you pull -q; mc=$(rev HEAD)
out=$(you revert --no-edit "$mc" 2>&1); rc=$?
has "マージコミットを -m なしで revert すると止まる" "$out" "is a merge but no -m option was given"
ne "（終了コードが 0 以外）" "$rc" "0"
you revert --abort >/dev/null 2>&1
you revert --no-edit -m 1 "$mc" >/dev/null
eq "git revert -m 1 マージコミット で、プルリクエストの変更が取り消される" "$(exists revert-me.txt)" "なし"
you reset -q --hard origin/master
you switch -q -c feature/rebase-stale; printf 's\n' > "$WORK/you/stale.txt"; you add stale.txt; you commit -qm "自分の変更"
other pull -q; printf 'n\n' > "$WORK/other/newer.txt"; other add .; other commit -qm "master がさらに進む"; other push -q origin master
you rebase -q origin/master
eq "fetch しないと、rebase は最後に fetch した時点の写しの先に付け替える" "$(you rev-parse --short HEAD~1)" "$(rev origin/master)"
ne "（その写しは、リモートの最新ではない）" "$(rev origin/master)" "$(git -C "$WORK/origin.git" rev-parse --short master)"
you fetch -q; you rebase -q origin/master
anc "fetch してから rebase すると、最新の origin/master の先に並ぶ" origin/master HEAD

sec "15. 端末では、マージコミットのメッセージを書くエディタが開く（--no-edit で開かない）"
printf '#!/bin/sh\necho opened >> "%s/editor.log"\n' "$WORK" > "$WORK/log-editor.sh"; chmod +x "$WORK/log-editor.sh"
cat > "$WORK/run-in-tty.py" <<'PYTTY2'
import os, pty, subprocess, sys
m, s = pty.openpty()
p = subprocess.Popen(sys.argv[1:], stdin=s, stdout=s, stderr=s, close_fds=True)
os.close(s)
while True:
    try:
        if not os.read(m, 4096): break
    except OSError: break
sys.exit(p.wait())
PYTTY2
# 端末（擬似端末）で git を動かし、エディタが呼ばれたかを記録から見る
opened(){ : > "$WORK/editor.log"; GIT_EDITOR="$WORK/log-editor.sh" python3 "$WORK/run-in-tty.py" git -C "$WORK/you" -c user.name=you -c user.email=you@example.com "$@"; if [ -s "$WORK/editor.log" ]; then echo 開く; else echo 開かない; fi; }
diverge(){ other switch -q master; other pull -q; printf '%s\n' "$1" > "$WORK/other/ed-$1.txt"; other add .; other commit -qm "ed $1"; other push -q origin master; printf '%s\n' "$1" > "$WORK/you/ed-$1.txt"; you add .; you commit -qm "you ed $1"; you fetch -q; }
you switch -q -c feature/editor-check
diverge 1; eq "端末で git merge origin/master（マージコミットができる）はエディタが開く" "$(opened merge origin/master)" "開く"
diverge 2; eq "git merge --no-edit なら開かない" "$(opened merge --no-edit origin/master)" "開かない"
diverge 3; eq "端末で git pull origin master（pull.rebase=false）もエディタが開く" "$(opened -c pull.rebase=false pull origin master)" "開く"
diverge 4; eq "git pull --no-edit なら開かない" "$(opened -c pull.rebase=false pull --no-edit origin master)" "開かない"
printf 'rv\n' > "$WORK/you/rv.txt"; you add rv.txt; you commit -qm "取り消すコミット"
eq "端末で git revert するとエディタが開く" "$(opened revert HEAD)" "開く"
printf 'rv2\n' > "$WORK/you/rv2.txt"; you add rv2.txt; you commit -qm "取り消すコミット2"
eq "git revert --no-edit なら開かない" "$(opened revert --no-edit HEAD)" "開かない"

printf '\n結果: %d 件 OK / %d 件 NG（作業フォルダ: %s）\n' "$PASS" "$FAIL" "$WORK"
[ "$FAIL" -eq 0 ]
