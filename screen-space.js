/* 공간 3D — SpaceScreen.swift + SpaceStage.swift 를 옮긴 것.

   맥 판은 WKWebView 가 SwiftUI 형제 뷰보다 위에 그려지는 탓에 도구들을 AppKit 으로 따로 얹어야 했다.
   웹에서는 그 문제가 없어 그냥 iframe 위에 얹는다. 대신 **자리 규칙은 그대로 옮긴다** —
   모드 줄과 상태 칸을 먼저 놓고, 오른쪽 레일은 그 둘이 비워 둔 띠 안에 앉는다. */
(function (PX) {
  'use strict';

  const SCAN_URL = id => 'space/room.html?scan=' + encodeURIComponent(id) + '&embed=1&light=1&m=photo';

  function mount(body, ctx) {
    const store = ctx.store;
    let tile = ctx.tile;

    body.classList.add('sp-root');
    body.innerHTML =
      `<iframe class="sp-frame" title="공간 3D"></iframe>
       <div class="sp-modes"></div>
       <div class="sp-rail"></div>
       <div class="sp-chip"></div>`;

    const frame = body.querySelector('.sp-frame');
    const modesEl = body.querySelector('.sp-modes');
    const railEl = body.querySelector('.sp-rail');
    const chipEl = body.querySelector('.sp-chip');

    // ── 상태 (SpaceStageModel) ──
    const m = {
      phase: { kind: 'loading', text: '공간 불러오는 중' },
      view: 'all',
      mode: 'photo',
      cover: null,
      gaps: 0,
      orbit: true,
      cams: false,          // CCTV 시야를 공간 안에 세워 두었는가
      camIDs: [],           // 공간 안에 선 카메라 번호 (3D 가 알려 준다)
      lens: null,           // 그 카메라가 보는 시점으로 들어가 있다면 그 번호
      scanID: PX.data.spaceScan.fallback,
      ownScan: true,
      gapIndex: -1,
      frameLoaded: false,
      pending: []
    };

    // ── 앱 → 3D ──
    function send(msg) {
      if (!m.frameLoaded || !frame.contentWindow) { m.pending.push(msg); return; }
      frame.contentWindow.postMessage(Object.assign({ px: 1 }, msg), '*');
    }
    function scanOf() {
      try { return new URL(frame.src, location.href).searchParams.get('scan'); } catch (e) { return null; }
    }
    /* 사건이 바뀌면 그 현장의 공간 기록으로 갈아 끼운다.
       room.html 은 스캔을 주소에서 읽으므로 새 주소를 넣는 것이 곧 새 공간이다 —
       같은 스캔이면 건드리지 않는다(28MB 를 다시 읽는다). */
    function setScan(inc) {
      const id = PX.data.spaceScan.of(inc);
      m.ownScan = PX.data.spaceScan.isOwn(inc);
      if (id === m.scanID) { drawChip(); return; }
      m.scanID = id;
      m.cams = false; m.camIDs = []; m.lens = null;
      m.cover = null; m.gaps = 0;
      m.frameLoaded = false;
      m.pending.length = 0;
      m.phase = { kind: 'loading', text: '현장 공간 불러오는 중' };
      frame.src = SCAN_URL(id);
      drawAll();
    }

    function setView(v) {
      if (v === 'gap') {
        if (!m.gaps) return;
        m.gapIndex = (m.gapIndex + 1) % m.gaps;
        send({ p: 'view', v: 'gap', i: m.gapIndex });
      } else {
        m.gapIndex = -1;
        send({ p: 'view', v: v });
      }
      m.view = v;
      m.orbit = false;
      send({ p: 'orbit', on: false });
      drawRail();
    }
    function setMode(x) { m.mode = x; send({ p: 'mode', m: x }); drawModes(); }
    function zoom(f) { m.orbit = false; send({ p: 'orbit', on: false }); send({ p: 'zoom', f: f }); drawRail(); }
    function setOrbit(on) { m.orbit = on; send({ p: 'orbit', on: on }); drawRail(); }

    /* 지도의 CCTV 부채꼴을 그대로 공간 안에 세운다.
       좌표는 사건 위치를 원점으로 한 상대 위치만 보낸다. 3D 쪽은 그 방위만 읽어
       카메라를 그 방향의 벽으로 밀어 붙인다 — 길 건너 30m 를 그대로 쓰면 방이 점이 된다.
       축: 우리 지도의 x 는 동쪽, y 는 남쪽. 3D 의 x·z 와 같은 방향이라 방위각에서 90도만 빼면 yaw 가 된다. */
    function setCams(on) {
      m.cams = on;
      if (!on) {
        m.camIDs = []; m.lens = null;
        send({ p: 'cctv', on: false });
        drawAll();
        return;
      }
      const inc = store.selectedIncident;
      const list = store.camerasOf(store.selectedIncidentID).map(c => ({
        id: c.id, label: c.id,
        x: c.point.x - inc.point.x,        // 동쪽(+)
        z: c.point.y - inc.point.y,        // 남쪽(+)
        yaw: c.facing - 90,
        fov: c.fov, range: c.range,
        h: 3.4                             // 전주 설치 높이 ≈ 3.4m
      }));
      // 부채꼴 색은 앱 강조색을 따라간다 — 3D 안에서만 다른 파랑이 쓰이면 따로 논다
      const tint = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#007aff';
      send({ p: 'cctv', on: true, key: tint, list: list });
      drawAll();
    }
    function toggleLens(id) {
      if (m.lens === id) { leaveLens(); return; }
      send({ p: 'lens', id: id });
      m.lens = id;
      drawAll();
    }
    function leaveLens() { send({ p: 'lens', id: '' }); m.lens = null; drawAll(); }

    // ── 3D → 앱 ──
    function onMessage(e) {
      if (e.source !== frame.contentWindow) return;
      const d = e.data;
      if (!d || d.px !== 1) return;
      switch (d.p) {
        case 'load': m.phase = { kind: 'loading', text: d.t || '공간 불러오는 중' }; drawChip(); break;
        case 'err': m.phase = { kind: 'failed', text: d.t || '공간을 못 읽었습니다' }; drawChip(); break;
        case 'ready':
          m.mode = d.mode || m.mode;
          m.cover = typeof d.cover === 'number' ? d.cover : null;
          m.gaps = d.gaps || 0;
          m.phase = { kind: 'ready' };
          send({ p: 'orbit', on: true });
          drawAll();
          break;
        case 'mode': m.mode = d.m || m.mode; drawModes(); break;
        case 'cctv':
          // 3D 가 실제로 세운 카메라 — 스캔이 작아 못 세운 것이 있을 수 있으니 그쪽 말을 따른다
          m.camIDs = d.ids || [];
          drawAll();
          break;
        case 'lens':
          // 3D 안의 이름표를 눌러 들어갈 수도 있다 — 그때도 단추가 함께 켜지게 받는다
          m.lens = d.id ? d.id : null;
          drawAll();
          break;
        case 'touch':
          // 3D 안을 손으로 건드렸다 — 고른 보기를 푼다 (자동 회전은 room.html 이 되살린다)
          m.view = null;
          drawRail();
          break;
      }
    }
    window.addEventListener('message', onMessage);

    frame.addEventListener('load', () => {
      const loaded = scanOf();
      // 올라온 스캔이 원하던 것과 다르면 여기서 한 번 더 바꾼다
      if (loaded && loaded !== m.scanID) {
        m.frameLoaded = false;
        m.phase = { kind: 'loading', text: '현장 공간 불러오는 중' };
        frame.src = SCAN_URL(m.scanID);
        drawChip();
        return;
      }
      m.frameLoaded = true;
      /* iframe 은 마우스 이동을 저 혼자 먹는다 — 그러면 창 이름표·단추와 아래쪽 독이
         3D 위에서는 영영 안 뜬다. 안에서 받은 이동을 바깥 좌표로 바꿔 다시 쏴 준다.
         (다른 출처로 열렸으면 접근이 막히므로 조용히 넘어간다) */
      try {
        frame.contentDocument.addEventListener('mousemove', ev => {
          const r = frame.getBoundingClientRect();
          frame.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true, clientX: r.left + ev.clientX, clientY: r.top + ev.clientY
          }));
        });
      } catch (e) { /* 파일로 열었을 때는 막힐 수 있다 */ }
      send({ p: 'orbit', on: true });     // 천천히 저절로 돈다
      const queued = m.pending.slice();
      m.pending.length = 0;
      queued.forEach(send);
    });

    // ── 그리기 ──
    const cams = () => store.camerasOf(store.selectedIncidentID);
    /** 3D 가 실제로 세운 것을 우선한다 — 대답이 오기 전에는 우리 목록을 그대로 쓴다 */
    const lensIDs = () => (m.camIDs.length ? m.camIDs : cams().map(c => c.id));
    /* 글자를 떼고 그림씨만 남길 때. 좁을 때뿐 아니라 낮을 때도 떼어야
       레일이 가늘어져 모드 줄·상태 칸과 겹치지 않는다 */
    const railCompact = () => tile.isTiny || tile.isShort;

    function railBtn(label, icon, on, act, extra) {
      return `<button class="sp-btn${on ? ' on' : ''}${railCompact() ? ' compact' : ''}"
                data-act="${act}"${extra || ''} title="${PX.esc(label)}">
                ${PX.icon(icon)}${railCompact() ? '' : `<span>${PX.esc(label)}</span>`}</button>`;
    }

    function drawRail() {
      const groups = [];
      let viewRows =
        railBtn('전체', 'cube', m.view === 'all', 'view:all') +
        railBtn('위', 'to-bottom', m.view === 'top', 'view:top') +
        railBtn('옆', 'to-right', m.view === 'side', 'view:side');
      // 낮은 창에서는 줄 수를 줄여야 레일이 위아래로 넘치지 않는다
      if (m.gaps > 0 && !tile.isShort) viewRows += railBtn('빈 곳', 'dash', m.view === 'gap', 'view:gap');
      groups.push(`<div class="sp-group">${viewRows}</div>`);

      // CCTV — 켜면 시야 부채꼴이 공간 안에 서고, 카메라마다 그 시점으로 들어갈 수 있다
      if (cams().length) {
        let rows = railBtn('CCTV', 'cctv', m.cams, 'cams');
        // 시점 단추는 자리를 많이 먹는다 — 낮은 창에서는 부채꼴만 남긴다
        if (m.cams && !tile.isShort) {
          rows += lensIDs().map(id =>
            railBtn(id, m.lens === id ? 'eye-fill' : 'eye', m.lens === id, 'lens', ` data-id="${PX.esc(id)}"`)
          ).join('');
        }
        groups.push(`<div class="sp-group">${rows}</div>`);
      }

      if (!tile.isShort) {
        groups.push(`<div class="sp-group">
          <button class="sp-btn compact" data-act="zoomin" title="확대">${PX.icon('zoom-in')}</button>
          <button class="sp-btn compact" data-act="zoomout" title="축소">${PX.icon('zoom-out')}</button>
          <button class="sp-btn compact" data-act="orbit" title="자동 회전">${PX.icon(m.orbit ? 'pause' : 'orbit')}</button>
        </div>`);
      }
      railEl.innerHTML = groups.join('');
      layout();
    }

    function drawModes() {
      const b = (label, icon, id) =>
        `<button class="sp-mode${m.mode === id ? ' on' : ''}" data-mode="${id}" title="${PX.esc(label)}">
           ${tile.isTiny ? PX.icon(icon) : PX.esc(label)}</button>`;
      modesEl.innerHTML = b('실제 색', 'photo', 'photo') + b('히트맵', 'flame', 'heat') + b('남은 곳', 'dash', 'left');
      layout();
    }

    function drawChip() {
      let inner;
      if (m.phase.kind === 'loading') {
        inner = `<span class="sp-spin"></span><span class="cap">${PX.esc(m.phase.text)}</span>`;
      } else if (m.phase.kind === 'failed') {
        inner = `${PX.icon('warning', 'sp-warn')}<span class="cap">${PX.esc(m.phase.text)}</span>`;
      } else if (m.lens) {
        // 카메라 시점에 들어가 있으면 그것부터 말한다 —
        // 지금 보고 있는 것은 방이 아니라 그 카메라가 잡는 화면이다
        inner = `${PX.icon('eye-fill', 'sp-accent')}<span class="cap sp-strong">${PX.esc(m.lens)} 시점</span>
                 <button class="sp-exit cap sec" data-act="leave">나가기</button>`;
      } else {
        inner = PX.icon('cube') + (tile.isTiny ? '' : `<span class="cap sp-strong">공간 기록</span>`);
        if (m.cover != null) inner += `<span class="cap sec">탐색 ${Math.round(m.cover * 100)}%</span>`;
        // 곁가지 숫자는 자리가 넉넉할 때만. 칸이 좁으면 오른쪽 레일과 부딪친다
        if (!tile.isNarrow && !tile.isShort) {
          if (m.gaps > 0) inner += `<span class="cap sec">안 본 곳 ${m.gaps}곳</span>`;
          if (m.cams) inner += `<span class="cap sec">CCTV ${lensIDs().length}대</span>`;
        }
        // 이 현장을 직접 스캔한 것이 아니면 밝힌다 — 없는 것을 있는 척하지 않는다
        if (!m.ownScan) {
          inner += `<span class="sp-rep cap" title="이 사건의 현장이 아니라 성격이 비슷한 공간을 대신 띄웁니다">대표 공간</span>`;
        }
      }
      chipEl.innerHTML = inner;
      layout();
    }

    function drawAll() { drawRail(); drawModes(); drawChip(); }

    /* 자리 맞추기 (SpaceHostView.layout).
       모드 줄과 상태 칸을 먼저 놓고, 오른쪽 레일은 그 둘이 비워 둔 띠 안에 앉는다.
       들어갈 자리가 아예 없으면 숨긴다 — 반쯤 잘려 보이거나 남의 자리를 덮는 것보다 낫다. */
    function layout() {
      const M = 12;
      /* 창 이름표(왼쪽)와 단추(오른쪽) 알약이 위쪽 띠에 뜬다.
         모드 줄은 그 **둘과 같은 줄**에 세우고(윗변을 맞춘다), 오른쪽 레일만 띠 아래로 내린다. */
      const CHROME = 46;
      const MODES_TOP = 8;
      const W = body.clientWidth, H = body.clientHeight;
      if (!W || !H) return;

      modesEl.hidden = false; railEl.hidden = false; chipEl.hidden = false;
      const mw = modesEl.offsetWidth, mh = modesEl.offsetHeight;
      const cw = chipEl.offsetWidth, ch = chipEl.offsetHeight;
      const rw = railEl.offsetWidth, rh = railEl.offsetHeight;

      const room = { w: W - M * 2, h: H - M * 2 };
      // 모드 줄: 가운데 위
      if (mw > room.w || mh > H - MODES_TOP - M) modesEl.hidden = true;
      else {
        modesEl.style.left = Math.max(M, (W - mw) / 2) + 'px';
        modesEl.style.top = MODES_TOP + 'px';
      }
      // 상태 칸: 왼쪽 아래
      if (cw > room.w || ch > room.h) chipEl.hidden = true;
      else {
        chipEl.style.left = M + 'px';
        chipEl.style.top = (H - M - ch) + 'px';
      }
      // 오른쪽 레일: 남은 띠 안에서 가운데
      const x = W - M - rw;
      // 레일은 오른쪽 가장자리라 단추 알약 바로 아래에서 시작한다
      let top = CHROME, bottom = H - M;
      if (!modesEl.hidden && (Math.max(M, (W - mw) / 2) + mw) > x - 8) top = Math.max(top, MODES_TOP + mh + 8);
      if (!chipEl.hidden && (M + cw) > x - 8) bottom = Math.min(bottom, H - M - ch - 8);
      if (rw > room.w || rh > Math.min(room.h, bottom - top)) railEl.hidden = true;
      else {
        railEl.style.left = x + 'px';
        railEl.style.top = Math.min(Math.max((H - rh) / 2, top), bottom - rh) + 'px';
      }
    }

    // ── 누름 처리 ──
    railEl.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a.indexOf('view:') === 0) setView(a.slice(5));
      else if (a === 'cams') setCams(!m.cams);
      else if (a === 'lens') toggleLens(b.dataset.id);
      else if (a === 'zoomin') zoom(1.25);
      else if (a === 'zoomout') zoom(0.8);
      else if (a === 'orbit') setOrbit(!m.orbit);
    });
    modesEl.addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (b) setMode(b.dataset.mode);
    });
    chipEl.addEventListener('click', e => {
      if (e.target.closest('[data-act="leave"]')) leaveLens();
    });

    // 사건을 바꾸면 그 현장의 공간 기록으로 갈아 끼우고, CCTV 도 그 현장 것으로 바꾼다.
    // 공간을 새로 읽으면 CCTV 가 꺼지므로 켜 두었는지는 바꾸기 전에 기억해 둔다
    const off = store.subscribe(what => {
      if (what !== 'incident') return;
      const wasOn = m.cams;
      setScan(store.selectedIncidentID);
      if (wasOn) setCams(true);
    });

    frame.src = SCAN_URL(PX.data.spaceScan.of(store.selectedIncidentID));
    m.scanID = PX.data.spaceScan.of(store.selectedIncidentID);
    m.ownScan = PX.data.spaceScan.isOwn(store.selectedIncidentID);
    drawAll();

    return {
      resize(t) { tile = t; drawAll(); },
      destroy() {
        off();
        window.removeEventListener('message', onMessage);
        frame.src = 'about:blank';
      }
    };
  }

  PX.screens.space = { mount: mount };
})(window.PX);
