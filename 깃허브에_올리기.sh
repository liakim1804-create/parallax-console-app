#!/bin/sh
# GitHub 에 올리고 링크로 열리게 만든다 (처음 한 번만)
#
#   sh 깃허브에_올리기.sh
#
# 끝나면 주소가 찍힌다. 링크를 아는 사람이면 누구나 볼 수 있는 공개 저장소다.
set -e

GH=/Users/liaki/.local/bin/gh
REPO=parallax-console-app
OWNER=liakim1804-create

cd "$(dirname "$0")"

# 1) 공개 저장소를 만들고 올린다 (94MB — 처음 올릴 때는 몇 분 걸린다)
"$GH" repo create "$REPO" --public --source=. --remote=origin --push \
  --description "PARALLAX 지휘통제 콘솔 — macOS 앱을 그대로 옮긴 웹 판"

# 2) GitHub Pages 를 켠다 (main 브랜치의 최상위 폴더를 그대로 웹으로 연다)
"$GH" api -X POST "repos/$OWNER/$REPO/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true

echo
echo "올렸습니다. 아래 주소가 열릴 때까지 1~2분 걸립니다."
echo
echo "   https://$OWNER.github.io/$REPO/"
echo
