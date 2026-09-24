#!/usr/bin/env python3
"""여러 파일로 나뉜 웹 콘솔을 HTML 한 개로 묶는다.

CSS·JS 는 본문 안으로 넣고, CCTV 사진은 data URI 로 박는다.
공간 3D 스캔(94MB)만은 넣을 수 없다 — 파일 하나에 담기에는 너무 크다.
대신 3D 뷰어를 **공개된 주소에서 불러오게** 바꾼다. 그래서 이 HTML 한 개만 있으면
어디에 두어도(데스크탑이든 메일 첨부든) 3D 까지 그대로 뜬다. 인터넷은 있어야 한다.

쓰는 법:  python3 한파일로_묶기.py
"""
import base64
import pathlib
import re

here = pathlib.Path(__file__).parent
out = here / "PARALLAX 통제실 (한 파일).html"

html = (here / "index.html").read_text(encoding="utf-8")

# 1) 스타일시트 넣기 (CDN 은 그대로 둔다 — 지도 라이브러리가 거기 있다)
def put_css(m):
    href = m.group(1)
    if href.startswith("http"):
        return m.group(0)
    return "<style>\n/* ===== %s ===== */\n%s\n</style>" % (
        href, (here / href).read_text(encoding="utf-8"))

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', put_css, html)

# 2) 스크립트 넣기
def put_js(m):
    src = m.group(1)
    if src.startswith("http"):
        return m.group(0)
    return "<script>\n/* ===== %s ===== */\n%s\n</script>" % (
        src, (here / src).read_text(encoding="utf-8"))

html = re.sub(r'<script src="([^"]+)"></script>', put_js, html)

# 3) 공간 3D 는 공개된 주소에서 불러온다 (스캔 94MB 를 파일에 넣을 수 없어서)
PAGES = "https://liakim1804-create.github.io/parallax-console-app/"
html = html.replace("'space/room.html?scan='", "'" + PAGES + "space/room.html?scan='")

# 4) CCTV 사진을 data URI 로
jpg = (here / "cctv_street.jpg").read_bytes()
uri = "data:image/jpeg;base64," + base64.b64encode(jpg).decode("ascii")
html = html.replace("cctv_street.jpg", uri)

out.write_text(html, encoding="utf-8")
print("만들었습니다:", out.name, "(%.1fMB)" % (out.stat().st_size / 1024 / 1024))

# 데스크탑의 작업본(v2)도 같이 갈아 끼운다.
# v1 은 손대지 않는다 — 되돌릴 자리로 남겨 둔 것이다.
desk = pathlib.Path.home() / "Desktop" / "통제실 v2.html"
if desk.parent.exists():
    desk.write_text(html, encoding="utf-8")
    print("데스크탑 작업본도 갱신:", desk.name)

print("※ 공간 3D 와 지도는 인터넷이 있어야 뜹니다.")
