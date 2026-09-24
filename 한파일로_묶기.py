#!/usr/bin/env python3
"""여러 파일로 나뉜 웹 콘솔을 HTML 한 개로 묶는다.

CSS·JS 는 본문 안으로 넣고, CCTV 사진은 data URI 로 박는다.
공간 3D 스캔(94MB)만은 넣지 않는다 — 브라우저가 감당하지 못한다.
그래서 만들어진 HTML 은 `space/` 폴더와 **같은 자리에** 두어야 3D 가 뜬다.

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

# 3) CCTV 사진을 data URI 로
jpg = (here / "cctv_street.jpg").read_bytes()
uri = "data:image/jpeg;base64," + base64.b64encode(jpg).decode("ascii")
html = html.replace("cctv_street.jpg", uri)

out.write_text(html, encoding="utf-8")
print("만들었습니다:", out.name, "(%.1fMB)" % (out.stat().st_size / 1024 / 1024))
print("※ 공간 3D 를 보려면 이 파일을 space/ 폴더와 같은 자리에 두세요.")
