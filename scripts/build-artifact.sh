#!/bin/bash
# Artifact（claude.ai の公開ページ）用に、CSS と JS を埋め込んだ1ファイルを dist/ に作る。
# 公開ページは <html><head><body> を自動で付けるので、ここでは中身だけを書き出す。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
OUT=dist/git-visualizer.html
{
  sed -n '/ARTIFACT:HEAD START/,/ARTIFACT:HEAD END/p' index.html | grep -v 'ARTIFACT:'
  echo '<style>'; cat css/style.css; echo '</style>'
  sed -n '/ARTIFACT:BODY START/,/ARTIFACT:BODY END/p' index.html | grep -v 'ARTIFACT:'
  echo '<script>'; cat js/data-commands.js js/data-patterns.js js/branch-names.js js/board.js js/settings.js js/app.js; echo '</script>'
} > "$OUT"
if grep -q '</script>' <(cat js/*.js); then echo "js の中に </script> があると埋め込みが壊れます" >&2; exit 1; fi
echo "作成: $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
