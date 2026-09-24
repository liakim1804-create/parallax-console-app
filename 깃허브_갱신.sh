#!/bin/sh
# 고친 것을 GitHub 에 올린다 (두 번째부터)
#
#   sh 깃허브_갱신.sh "무엇을 고쳤는지"
#
set -e
cd "$(dirname "$0")"
MSG="${1:-웹 판 수정}"
git add -A
git diff --cached --quiet && { echo "바뀐 것이 없습니다."; exit 0; }
git commit -q -m "$MSG"
git push -q origin main
echo "올렸습니다: $MSG"
echo "   https://liakim1804-create.github.io/parallax-console-app/  (1~2분 뒤 반영)"
