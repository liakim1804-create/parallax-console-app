/* 콘솔 껍데기 — ContentView.swift 를 옮긴 것.
   상단 상태바 · 왼쪽 런처 · 떠 있는 창들 · 하단 작업표시줄.

   창 안의 화면은 **열 때 한 번만 만들고**, 자리가 바뀌어도 다시 만들지 않는다.
   지도와 3D 는 다시 만들면 타일과 28MB 스캔을 처음부터 다시 읽는다. */
(function (PX) {
  'use strict';

  const store = PX.store, wm = PX.wm;
  const deskEl = PX.$('#desk');
  const railEl = PX.$('#rail');
  const previewEl = PX.$('#drop-preview');

  const live = {};          // 탭 id → { win, bodyEl, inst, tile }
  let railW = +(localStorage.getItem('railWidth') || 190);
  let railDrag = null;

  // ── 상태바 ─────────────────────────────────────────
  function drawStatusBar() {
    const inc = store.selectedIncident;
    PX.$('#statusbar').className = 'glass';
    PX.$('#statusbar').innerHTML =
      `<div class="logo">PARALLAX</div>
       <div class="cap sec mono" id="sb-clock">${PX.now(true)}</div>
       <div class="sb-inc"><b>${PX.esc(inc.id)}</b><span class="cap">${PX.esc(inc.type)}</span></div>
       <div class="sb-fake" title="지도는 실제이고 사건·인력·장소는 모두 가상입니다">가상 데이터</div>
       <div class="sb-stats">
         <span class="sb-stat"><span class="sec">진행 중 사건</span><b>${store.activeIncidents.length}건</b></span>
         <span class="sb-stat"><span class="sec">투입 인원</span><b>${store.officers.filter(o => o.incidentID).length}명</b></span>
         <span class="sb-stat"><span class="sec">긴급 알림</span><b>${store.unseenAlertCount}건</b></span>
       </div>
       <div class="sb-icons">
         <button class="btn icon" data-act="dark" title="다크 모드">${PX.icon(store.darkMode ? 'sun' : 'moon')}</button>
         <button class="btn icon" data-act="sound" title="알림음">${PX.icon(store.soundOn ? 'sound' : 'mute')}</button>
         <button class="btn icon" title="단축키">${PX.icon('keyboard')}</button>
         <button class="btn icon" title="계정">${PX.icon('user')}</button>
       </div>`;
    PX.$('#statusbar').onclick = e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'dark') {
        store.darkMode = !store.darkMode;
        document.documentElement.dataset.theme = store.darkMode ? 'dark' : 'light';
        store.emit('theme');
        drawStatusBar();
      } else if (b.dataset.act === 'sound') {
        store.soundOn = !store.soundOn;
        drawStatusBar();
      }
    };
  }
  setInterval(() => {
    const c = PX.$('#sb-clock');
    if (c) c.textContent = PX.now(true);
  }, 1000);

  // ── 왼쪽 런처 ───────────────────────────────────────
  function drawRail() {
    const compact = railW < 118;
    railEl.className = 'glass' + (compact ? ' compact' : '');
    railEl.style.width = railW + 'px';
    railEl.innerHTML = PX.TABS.map(t => {
      const open = wm.isOpen(t.id);
      const cls = 'rail-item' + (open ? (wm.focused === t.id ? ' open focus' : ' open') : '');
      return `<button class="${cls}" data-tab="${t.id}" title="${PX.esc(t.name)}">
                ${PX.icon(t.icon)}<span>${PX.esc(t.name)}</span></button>`;
    }).join('');
    railEl.onclick = e => {
      const b = e.target.closest('[data-tab]');
      if (b) wm.toggle(b.dataset.tab);
    };
  }

  // 앱 바와 작업 영역 사이 모서리 — 끌어서 너비 조절
  (function railGrabber() {
    const grab = PX.$('#railgrab');
    let start = 0, from = 0;
    grab.addEventListener('mousedown', e => {
      e.preventDefault();
      start = e.clientX; from = railW;
      railDrag = railW;
      document.body.classList.add('resizing');
      const move = ev => {
        const want = from + (ev.clientX - start);
        railW = Math.round(PX.clamp(want, 56, 260) / 4) * 4;   // 4px 단위로 끊는다
        drawRail();
        sizeAll();
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
        // 애매한 폭에서는 가까운 쪽으로 붙인다 — 아이콘만 보이거나, 이름까지 보이거나
        if (railW < 100) railW = 56;
        else if (railW < 140) railW = 150;
        localStorage.setItem('railWidth', railW);   // 저장은 손을 놓을 때 한 번만
        railDrag = null;
        drawRail();
        sizeAll();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  })();

  /* ── 창 배치 독 ─────────────────────────────────────
     하단 바를 없애고 세 단추만 남겼다. 작업 영역 아래쪽에 손이 왔을 때만 떠오른다 —
     늘 떠 있으면 창 아래쪽(지도의 재생 막대, 3D 상태 칸)을 가린다. */
  const dockEl = PX.$('#dock');
  dockEl.innerHTML =
    `<button class="dock-btn" data-tile="2">${PX.icon('split2')}2분할</button>
     <button class="dock-btn" data-tile="4">${PX.icon('split4')}4분할</button>
     <button class="dock-btn" data-reset="1">${PX.icon('reset')}위치 초기화</button>`;
  dockEl.onclick = e => {
    const tile = e.target.closest('[data-tile]');
    if (tile) { wm.tile(+tile.dataset.tile); return; }
    if (e.target.closest('[data-reset]')) wm.resetLayout();
  };

  /* 아래쪽 띠에 손이 들어오면 띄운다.
     창 안에 iframe(공간 3D)이 있으면 그 위에서는 바깥이 마우스 이동을 못 받는다.
     그래서 작업 영역 맨 아래에 **창 사이 틈만큼 얇은 띠**를 하나 깔아 그때도 잡는다. */
  const DOCK_ZONE = 70;
  let dockTimer = null;
  const showDock = () => { clearTimeout(dockTimer); dockEl.classList.add('on'); };
  const hideDock = ms => {
    clearTimeout(dockTimer);
    dockTimer = setTimeout(() => dockEl.classList.remove('on'), ms || 0);
  };
  const zoneEl = PX.el('<div id="dock-zone"></div>');
  deskEl.appendChild(zoneEl);
  zoneEl.addEventListener('mouseenter', showDock);
  zoneEl.addEventListener('mouseleave', () => hideDock(350));
  dockEl.addEventListener('mouseenter', showDock);
  dockEl.addEventListener('mouseleave', () => hideDock(350));
  deskEl.addEventListener('mousemove', e => {
    const r = deskEl.getBoundingClientRect();
    if ((r.bottom - e.clientY) <= DOCK_ZONE) showDock(); else hideDock(250);
  });
  deskEl.addEventListener('mouseleave', () => hideDock(200));

  // ── 창 ────────────────────────────────────────────
  function makeWindow(w) {
    const tab = PX.tabOf(w.id);
    const el = PX.el(
      `<section class="win glass" data-win="${w.id}">
         <div class="win-body"></div>
         <header class="win-bar">
           <span class="win-title">
             ${PX.icon(tab.icon)}<b>${PX.esc(tab.name)}</b>
           </span>
           <span class="win-btns">
             <button data-max="1" title="최대화">${PX.icon('expand')}</button>
             <button data-close="1" title="닫기">${PX.icon('close')}</button>
           </span>
         </header>
       </section>`);
    deskEl.appendChild(el);

    el.addEventListener('mousedown', () => wm.focus(w.id), true);

    // 창 위쪽 띠에 손이 들어왔을 때만 이름표와 단추를 띄운다
    const TOP_ZONE = 46;
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      el.classList.toggle('chrome', (e.clientY - r.top) <= TOP_ZONE);
    });
    el.addEventListener('mouseleave', () => el.classList.remove('chrome'));
    el.querySelector('[data-max]').onclick = e => { e.stopPropagation(); wm.toggleMax(w.id); };
    el.querySelector('[data-close]').onclick = e => { e.stopPropagation(); wm.close(w.id); };
    dragTitleBar(el, w.id);

    const body = el.querySelector('.win-body');
    const entry = { el: el, bodyEl: body, inst: null, tile: null };
    live[w.id] = entry;

    const screen = PX.screens[w.id];
    if (screen) {
      try {
        entry.inst = screen.mount(body, { store: store, wm: wm, tile: PX.tile(400, 300) });
      } catch (err) {
        console.error('화면을 못 열었습니다:', w.id, err);
        body.innerHTML = `<div style="padding:20px" class="sec cap">${PX.esc(w.id)} 화면을 여는 중 오류가 났습니다.</div>`;
      }
    } else {
      body.innerHTML = `<div style="padding:20px" class="sec cap">${PX.esc(tab.name)}은(는) 아직 옮기는 중입니다.</div>`;
    }
    return entry;
  }

  /* 제목줄을 끌어 자리를 옮긴다.
     판정은 **손끝(포인터)** 으로 한다 — 창 중심으로 재면 큰 창일수록 한참 끌어야 반응해 둔하다. */
  function dragTitleBar(el, id) {
    const bar = el.querySelector('.win-title');
    bar.addEventListener('mousedown', e => {
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let started = false;
      const move = ev => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!started && Math.hypot(dx, dy) < 1.5) return;
        if (!started) {
          started = true;
          wm.beginDrag(id);
          el.classList.add('dragging');
          el.classList.remove('settling');
        }
        el.style.transform = `translate(${dx}px, ${dy}px)`;   // 창은 손을 그대로 따라온다
        const box = deskEl.getBoundingClientRect();
        wm.updateDrag(id, { x: (ev.clientX - box.left) / box.width, y: (ev.clientY - box.top) / box.height });
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (!started) return;
        el.classList.remove('dragging');
        el.style.transform = '';
        el.classList.add('settling');
        wm.endDrag(id);
        setTimeout(() => el.classList.remove('settling'), 260);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  /** 창 목록을 지금 상태에 맞춘다 (열고 닫을 때만 만들고 없앤다) */
  function syncWindows() {
    Object.keys(live).forEach(id => {
      const w = wm.win(id);
      if (!w) {                       // 닫혔다
        const e = live[id];
        if (e.inst && e.inst.destroy) { try { e.inst.destroy(); } catch (err) { console.error(err); } }
        e.el.remove();
        delete live[id];
      }
    });
    wm.windows.forEach(w => { if (!live[w.id]) makeWindow(w); });
    sizeAll();
  }

  /** 창 자리와 크기를 화면에 반영한다 */
  function sizeAll() {
    const box = deskEl.getBoundingClientRect();
    wm.noteDeskSize(box.width, box.height);

    wm.windows.forEach(w => {
      const e = live[w.id];
      if (!e) return;
      if (w.minimized) { e.el.hidden = true; return; }
      e.el.hidden = false;
      const f = w.maximized ? { x: 0, y: 0, w: 1, h: 1 } : w.frac;
      // Swift 판처럼 칸 사이에 8pt 를 비워 창이 서로 붙어 보이지 않게 한다
      const x = f.x * box.width, y = f.y * box.height;
      const cw = Math.max(f.w * box.width - 8, 140), ch = Math.max(f.h * box.height - 8, 120);
      e.el.style.left = (x + 4) + 'px';
      e.el.style.top = (y + 4) + 'px';
      e.el.style.width = cw + 'px';
      e.el.style.height = ch + 'px';
      e.el.style.zIndex = w.z;
      e.el.classList.toggle('focus', wm.focused === w.id);
      e.el.classList.toggle('tiny', cw < 260);
      // 이름이 빠지고 아이콘만 남을 때만 풍선말을 붙인다 (보이는 글자를 또 띄우지 않게)
      const titleEl = e.el.querySelector('.win-title');
      if (cw < 260) titleEl.setAttribute('title', PX.tabOf(w.id).name);
      else titleEl.removeAttribute('title');
      e.el.classList.toggle('short', ch < 200);

      // 화면 안쪽에 지금 크기를 알려 준다 (TileMeasured).
      // 제목줄은 내용 위에 떠 있을 뿐 칸을 차지하지 않으므로 높이를 빼지 않는다
      const t = PX.tile(cw, ch);
      const was = e.tile;
      e.tile = t;
      if (e.inst && e.inst.resize && (!was || was.width !== t.width || was.height !== t.height)) {
        try { e.inst.resize(t); } catch (err) { console.error(err); }
      }
    });
    drawDividers();
  }

  // ── 창 사이 경계 ───────────────────────────────────
  // 끄는 도중에는 손잡이를 다시 만들지 않는다 — 잡고 있던 것이 사라지면 표시가 끊긴다
  let dividerDrag = false;
  function drawDividers() {
    if (dividerDrag) return;
    PX.$$('.divider', deskEl).forEach(d => d.remove());
    const box = deskEl.getBoundingClientRect();
    wm.dividers.forEach(d => {
      const v = d.axis === 'v';
      const el = PX.el(`<div class="divider ${v ? 'v' : 'h'}"></div>`);
      const len = (d.end - d.start) * (v ? box.height : box.width);
      if (v) {
        el.style.left = (d.position * box.width - 6) + 'px';
        el.style.top = (d.start * box.height + 6) + 'px';
        el.style.height = Math.max(len - 12, 24) + 'px';
      } else {
        el.style.top = (d.position * box.height - 6) + 'px';
        el.style.left = (d.start * box.width + 6) + 'px';
        el.style.width = Math.max(len - 12, 24) + 'px';
      }
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        el.classList.add('on');
        dividerDrag = true;
        document.body.classList.add('resizing');
        const move = ev => {
          const b = deskEl.getBoundingClientRect();
          wm.moveDivider(d, v ? (ev.clientX - b.left) / b.width : (ev.clientY - b.top) / b.height);
          sizeAll();
        };
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          document.body.classList.remove('resizing');
          el.classList.remove('on');
          dividerDrag = false;
          drawDividers();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
      deskEl.appendChild(el);
    });
  }

  // ── 놓을 자리 미리보기 ─────────────────────────────
  function drawPreview() {
    const zone = wm.drag.zone;
    if (!zone) { previewEl.hidden = true; return; }
    const box = deskEl.getBoundingClientRect();
    const r = zone.rect;
    previewEl.hidden = false;
    previewEl.style.left = (r.x * box.width + 4) + 'px';
    previewEl.style.top = (r.y * box.height + 4) + 'px';
    previewEl.style.width = Math.max(r.w * box.width - 8, 40) + 'px';
    previewEl.style.height = Math.max(r.h * box.height - 8, 40) + 'px';
  }

  // ── 붙이기 ────────────────────────────────────────
  wm.subscribe(what => {
    if (what === 'drag') { drawPreview(); return; }
    if (what === 'frames') { return; }          // 경계 끌기는 sizeAll 이 직접 부른다
    drawRail();
    syncWindows();
  });
  store.subscribe(what => {
    if (what === 'incident' || what === 'messages' || what === 'alerts') drawStatusBar();
  });

  /* 단축키 — 맥 판의 「창 배치」·「앱」 메뉴와 같게 둔다.
     브라우저가 이미 쓰는 것(⌘W 로 탭 닫기 등)은 막을 수 없으므로 preventDefault 로 가로챈다. */
  window.addEventListener('keydown', e => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;   // 글을 쓰는 중에는 건드리지 않는다

    // ⌘1~5 — 앱 열기
    if (!e.altKey && /^[1-5]$/.test(e.key) && !e.ctrlKey) {
      e.preventDefault();
      wm.open(PX.TABS[+e.key - 1].id);
      return;
    }
    // ⌃⌘2 / ⌃⌘4 / ⌃⌘R — 2분할 · 4분할 · 위치 초기화
    if (e.ctrlKey && e.metaKey) {
      if (e.key === '2') { e.preventDefault(); wm.tile(2); return; }
      if (e.key === '4') { e.preventDefault(); wm.tile(4); return; }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); wm.resetLayout(); return; }
    }
    // ⌘` / ⌘⇧` — 다음 창 · 이전 창
    if (e.key === '`') { e.preventDefault(); wm.cycleFocus(e.shiftKey ? -1 : 1); return; }
    // ⌘W — 창 닫기
    if (e.key.toLowerCase() === 'w') { e.preventDefault(); wm.close(wm.focused); return; }
  });

  // ⌃⌥←/→/↑ — 포커스된 창을 절반·전체로 (맥 판의 snapFocused)
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.altKey)) return;
    const w = wm.win(wm.focused);
    if (!w) return;
    const spot = e.key === 'ArrowLeft' ? { x: 0, y: 0, w: 0.5, h: 1 }
      : e.key === 'ArrowRight' ? { x: 0.5, y: 0, w: 0.5, h: 1 }
      : e.key === 'ArrowUp' ? { x: 0, y: 0, w: 1, h: 1 }
      : e.key === 'ArrowDown' ? { x: 0, y: 0.5, w: 1, h: 0.5 } : null;
    if (!spot) return;
    e.preventDefault();
    w.frac = spot;
    w.maximized = false;
    sizeAll();
  });

  window.addEventListener('resize', sizeAll);

  document.documentElement.dataset.theme = store.darkMode ? 'dark' : 'light';
  drawStatusBar();
  drawRail();
  syncWindows();
})(window.PX);
