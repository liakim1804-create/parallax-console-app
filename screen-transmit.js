/* 현장 정보 전송 창 (MessagesScreen.swift 를 옮긴 것)
   메시지·긴급 알림: 받는 대상 알약 + 말풍선 + 작성 칸 (웹 판과 같은 구성)

   SwiftUI 는 @State/@Published 가 바뀌면 저절로 다시 그리지만 여기서는 그런 것이 없어,
   상태를 바꾼 뒤 직접 draw() 를 부르고 다른 창이 바꾼 것은 store.subscribe 로 받는다. */
(function (PX) {
  'use strict';

  /** 중요도 세 가지 (MessageKind) */
  const KINDS = ['일반', '중요', '긴급'];

  /** 중요도 색: 긴급 빨강 · 중요 주황 (일반은 표시하지 않는다) */
  const kindCls = k => (k === '긴급' ? 'urgent' : 'caution');

  PX.screens.transmit = {
    mount(bodyEl, ctx) {
      const store = ctx.store;
      let tile = ctx.tile || PX.tile(400, 300);

      // ── 화면 상태 (@State) ──
      let targetID = null;          // 고른 대상 id (없으면 첫 번째로 떨어진다)
      let kind = '일반';            // 보낼 중요도
      let showAlerts = false;       // 종 단추: 대화 대신 알림 기록
      let lastCount = store.messages.length;   // 메시지가 늘면 맨 아래로 내린다
      let composerKey = null;       // 입력칸이 지금 어느 대상의 임시 입력을 들고 있나

      // ── 대상 목록 ──
      const groups = () => store.chatTargets;
      const allTargets = () => groups().reduce((a, g) => a.concat(g.targets), []);
      // Swift 와 같다: 고른 id 가 없어졌으면 첫 번째 대상으로 떨어진다 (id 자체는 그대로 둔다)
      const target = () => {
        const all = allTargets();
        return all.find(t => t.id === targetID) || all[0] || null;
      };

      // ── 뼈대 (한 번만 만든다. 입력칸을 다시 만들면 치던 글과 커서가 날아간다) ──
      const root = PX.el(
        `<div class="tx-root">
           <div class="tx-head">
             <button class="tx-dd tx-dd-target" type="button" aria-haspopup="true">
               <span class="tx-dd-label"></span>${PX.icon('chev-ud', 'tx-dd-chev')}
             </button>
             <div class="tx-head-gap"></div>
             <button class="tx-bell" type="button" title="알림 기록">
               ${PX.icon('bell')}<span class="tx-badge" hidden></span>
             </button>
           </div>

           <div class="tx-thread"><div class="tx-list"></div></div>

           <div class="tx-composer-wrap">
             <div class="tx-composer">
               <button class="tx-dd tx-kind" type="button" aria-haspopup="true">
                 <span class="tx-dd-label">일반</span>${PX.icon('chev-ud', 'tx-dd-chev')}
               </button>
               <div class="tx-input-row">
                 <textarea class="tx-input" rows="1" spellcheck="false"></textarea>
                 <button class="tx-send" type="button" title="보내기">${PX.icon('arrow-up')}</button>
               </div>
             </div>
           </div>

           <div class="tx-alerts"></div>
         </div>`);
      bodyEl.appendChild(root);

      const ddTarget = root.querySelector('.tx-dd-target');
      const ddTargetLabel = ddTarget.querySelector('.tx-dd-label');
      const ddKind = root.querySelector('.tx-kind');
      const ddKindLabel = ddKind.querySelector('.tx-dd-label');
      const bellBtn = root.querySelector('.tx-bell');
      const badgeEl = root.querySelector('.tx-badge');
      const threadEl = root.querySelector('.tx-thread');
      const listEl = root.querySelector('.tx-list');
      const alertsEl = root.querySelector('.tx-alerts');
      const inputEl = root.querySelector('.tx-input');
      const sendBtn = root.querySelector('.tx-send');

      // ══ 드롭다운 ══════════════════════════════════════════════
      // macOS 기본 피커는 창 안에서 왼쪽 여백이 제각각이고 어두운 배경 위에서 글자가 묻혀서,
      // Swift 판(GlassDropdown)처럼 라벨을 직접 그린다. <select> 를 쓰면 화살표가 하나 더 생긴다.
      let menuEl = null;
      let menuOwner = null;

      function closeMenu() {
        if (menuEl) { menuEl.remove(); menuEl = null; }
        if (menuOwner) { menuOwner.classList.remove('open'); menuOwner = null; }
      }

      /** items: {kind:'section'|'item'|'none', label, value}[] */
      function openMenu(items, onPick, opts) {
        const wasOwner = menuOwner;
        closeMenu();
        if (opts.anchor && wasOwner === opts.anchor) return;   // 같은 단추를 다시 누르면 닫기

        menuEl = PX.el('<div class="tx-menu glass"></div>');
        items.forEach(it => {
          if (it.kind === 'section') {
            menuEl.appendChild(PX.el(`<div class="tx-menu-sec">${PX.esc(it.label)}</div>`));
          } else if (it.kind === 'none') {
            menuEl.appendChild(PX.el(`<div class="tx-menu-none">${PX.esc(it.label)}</div>`));
          } else {
            const b = PX.el(`<button class="tx-menu-item${it.on ? ' on' : ''}" type="button">${PX.esc(it.label)}</button>`);
            b.onclick = ev => { ev.stopPropagation(); closeMenu(); onPick(it.value); };
            menuEl.appendChild(b);
          }
        });
        root.appendChild(menuEl);

        // 창 안쪽(overflow:hidden)을 넘지 않게 자리를 잡는다. 아래가 좁으면 위로 편다
        const rb = root.getBoundingClientRect();
        const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
        let left, top;
        if (opts.anchor) {
          const ab = opts.anchor.getBoundingClientRect();
          left = ab.left - rb.left;
          const below = rb.bottom - ab.bottom - 6;
          const above = ab.top - rb.top - 6;
          if (mh <= below || below >= above) {
            top = ab.bottom - rb.top + 4;
            menuEl.style.maxHeight = Math.max(80, below - 4) + 'px';
          } else {
            top = Math.max(4, ab.top - rb.top - 4 - Math.min(mh, above));
            menuEl.style.maxHeight = Math.max(80, above - 4) + 'px';
          }
          if (opts.matchWidth) menuEl.style.minWidth = ab.width + 'px';
        } else {
          left = opts.x - rb.left;
          top = opts.y - rb.top;
          if (top + mh > rb.height - 4) top = Math.max(4, rb.height - mh - 4);
          menuEl.style.maxHeight = Math.max(80, rb.height - 8) + 'px';
        }
        menuEl.style.left = PX.clamp(left, 4, Math.max(4, rb.width - mw - 4)) + 'px';
        menuEl.style.top = top + 'px';

        if (opts.anchor) { menuOwner = opts.anchor; menuOwner.classList.add('open'); }
      }

      const onDocDown = e => { if (menuEl && !menuEl.contains(e.target) && e.target !== menuOwner && !(menuOwner && menuOwner.contains(e.target))) closeMenu(); };
      const onKeyDown = e => { if (e.key === 'Escape') closeMenu(); };
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onKeyDown, true);

      // 받는 대상 고르기 — 묶음(현장팀/후속팀/상황실 내부)별로 나눠 보여 준다
      ddTarget.onclick = () => {
        const items = [];
        groups().forEach(g => {
          if (!g.targets.length) {
            // 등록된 대상이 없는 묶음도 숨기지 않고 그대로 알린다
            items.push({ kind: 'none', label: g.title + ' · 등록된 대상 없음' });
          } else {
            items.push({ kind: 'section', label: g.title });
            const cur = target();
            g.targets.forEach(t => items.push({ kind: 'item', label: t.label, value: t.id, on: cur && cur.id === t.id }));
          }
        });
        openMenu(items, id => { targetID = id; draw(); }, { anchor: ddTarget, matchWidth: true });
      };

      ddKind.onclick = () => {
        openMenu(KINDS.map(k => ({ kind: 'item', label: k, value: k, on: k === kind })),
                 k => { kind = k; draw(); }, { anchor: ddKind, matchWidth: true });
      };

      // ── 알림 종 ──
      bellBtn.onclick = () => {
        showAlerts = !showAlerts;
        if (showAlerts) store.markAllAlertsSeen();
        closeMenu();
        draw();
      };

      // ══ 대화 내역 ═════════════════════════════════════════════
      function bubbleHTML(m) {
        const mine = !!m.isMine;
        const meta = [];

        if (m.kind !== '일반') {
          meta.push(
            `<span class="tx-kindchip ${kindCls(m.kind)}">` +
            `<span class="dot ${kindCls(m.kind)}"></span>` +
            `<span class="tx-kindtext">${PX.esc(m.kind)}</span></span>`);
        }
        meta.push(`<span class="tx-from">${PX.esc(m.from)}</span>`);
        // 좁으면 보낸 쪽만 남긴다 — 받는 쪽은 위 드롭다운에 이미 있다
        meta.push(`<span class="tx-arrow">→</span><span class="tx-to">${PX.esc(m.to)}</span>`);
        if (m.isPinned) meta.push(PX.icon('pushpin', 'tx-pin'));

        const state = mine ? (m.isRead ? '확인' : '전송됨') : (m.isRead ? '확인' : '미확인');
        const readBtn = (!mine && !m.isRead)
          ? `<button class="tx-readbtn" type="button" data-read="${PX.esc(m.id)}">확인</button>` : '';

        return `<div class="tx-row ${mine ? 'mine' : 'theirs'}">
            <div class="tx-bubble${m.isPinned ? ' pinned' : ''}" data-msg="${PX.esc(m.id)}">
              <div class="tx-meta">${meta.join('')}</div>
              <div class="tx-text">${PX.esc(m.text)}</div>
              <div class="tx-foot">
                <span class="mono">${PX.esc(m.time)}</span>
                <span>${PX.esc(state)}</span>${readBtn}
              </div>
            </div>
          </div>`;
      }

      function drawThread() {
        const t = target();
        const keep = threadEl.scrollTop;
        let html = '';
        if (!t) {
          html = '<div class="tx-empty">이 팀에 등록된 대상이 없습니다.</div>';
        } else {
          const list = store.thread(t);
          if (!list.length) {
            html = `<div class="tx-empty">${PX.esc(t.label)} 와(과) 주고받은 메시지가 없습니다.</div>`;
          }
          html += list.map(bubbleHTML).join('');
        }
        listEl.innerHTML = html;

        // 메시지가 늘었을 때만 맨 아래로 (Swift 의 onChange(of: messages.count) + withAnimation).
        // 그 밖에는 보던 자리를 지킨다 — 다시 그릴 때마다 목록이 맨 위로 튀면 읽을 수가 없다
        if (store.messages.length !== lastCount) {
          lastCount = store.messages.length;
          threadEl.scrollTo({ top: threadEl.scrollHeight, behavior: 'smooth' });
        } else {
          threadEl.scrollTop = keep;
        }
      }

      // 말풍선: 확인 단추 · 오른쪽 단추(고정/확인 처리) — Swift 의 .contextMenu
      listEl.addEventListener('click', e => {
        const b = e.target.closest('[data-read]');
        if (b) store.markRead(b.getAttribute('data-read'));
      });
      listEl.addEventListener('contextmenu', e => {
        const b = e.target.closest('[data-msg]');
        if (!b) return;
        e.preventDefault();
        const id = b.getAttribute('data-msg');
        const m = store.messages.find(x => x.id === id);
        if (!m) return;
        const items = [{ kind: 'item', label: m.isPinned ? '고정 해제' : '고정', value: 'pin' }];
        if (!m.isMine && !m.isRead) items.push({ kind: 'item', label: '확인 처리', value: 'read' });
        openMenu(items, v => { if (v === 'pin') store.togglePin(id); else store.markRead(id); },
                 { x: e.clientX, y: e.clientY });
      });

      // ══ 알림 기록 ═════════════════════════════════════════════
      function drawAlerts() {
        if (!store.alerts.length) {
          alertsEl.innerHTML = '<div class="tx-empty">알림 기록이 없습니다.</div>';
          return;
        }
        alertsEl.innerHTML = store.alerts.map((a, i) => (
          `<div class="tx-alert">
             ${PX.dot(a.level)}
             <div class="tx-alert-body">
               <div class="tx-alert-head">
                 <span class="tx-alert-title${a.seen ? '' : ' unseen'}">${PX.esc(a.title)}</span>
                 <span class="tx-alert-time cap sec">${PX.esc(a.time)}</span>
               </div>
               <div class="tx-alert-detail${a.seen ? ' seen' : ''}">${PX.esc(a.detail)}</div>
             </div>
           </div>` + (i < store.alerts.length - 1 ? '<hr class="hair">' : '')
        )).join('');
      }

      // ══ 작성 칸 ═══════════════════════════════════════════════
      function placeholder(t) {
        // 안내 문구가 길면 칸이 밀려 보내기 단추가 잘린다 — 좁을수록 짧게
        if (!t) return tile.isNarrow ? '대상 선택' : '받는 대상을 먼저 선택하십시오.';
        return tile.isVeryNarrow ? '내용' : (tile.isNarrow ? '내용 입력' : '내용을 입력하십시오.');
      }

      const draftOf = t => (t ? (store.drafts[t.id] || '') : '');
      const canSend = () => { const t = target(); return !!t && draftOf(t).trim().length > 0; };

      /** 줄 수는 낮은 창에서 2줄, 아니면 4줄까지만 늘어난다 (Swift lineLimit) */
      function autoGrow() {
        const max = (tile.isShort ? 2 : 4) * 19 + 16;
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, max) + 'px';
      }

      function syncComposer() {
        const t = target();
        const key = t ? t.id : '';
        inputEl.placeholder = placeholder(t);
        inputEl.disabled = !t;
        // 임시 입력은 대상마다 따로 남는다. 대상이 바뀌었을 때만 칸을 갈아 끼운다
        if (composerKey !== key || document.activeElement !== inputEl) {
          inputEl.value = draftOf(t);
          composerKey = key;
        }
        autoGrow();
        ddKindLabel.textContent = kind;
        const ok = canSend();
        sendBtn.disabled = !ok;
        sendBtn.classList.toggle('urgent', ok && kind === '긴급');
      }

      function doSend() {
        const t = target();
        if (!t || !canSend()) return;
        store.send(t, store.drafts[t.id] || '', kind);
        inputEl.value = '';
        autoGrow();
      }

      inputEl.addEventListener('input', () => {
        const t = target();
        // 임시 입력은 store 에 둔다 — 대상을 바꿔도 남아야 한다.
        // 글자마다 emit 하지는 않는다. drafts 를 보는 창이 이 화면뿐이라 다른 창을 깨울 일이 없다
        if (t) store.drafts[t.id] = inputEl.value;
        autoGrow();
        const ok = canSend();
        sendBtn.disabled = !ok;
        sendBtn.classList.toggle('urgent', ok && kind === '긴급');
      });
      inputEl.addEventListener('keydown', e => {
        // Swift 의 onSubmit. 한글을 조합하는 중(isComposing)에 누른 Enter 는 글자를 맺는 것이지
        // 보내라는 뜻이 아니다 — 그냥 보내면 낱자만 들어간 채로 나간다
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          doSend();
        }
      });
      sendBtn.onclick = doSend;

      // ══ 창 크기 ═══════════════════════════════════════════════
      function applyTile() {
        root.classList.toggle('narrow', tile.isNarrow);
        root.classList.toggle('vnarrow', tile.isVeryNarrow);
        root.classList.toggle('tiny', tile.isTiny);
        root.classList.toggle('short', tile.isShort);
        root.classList.toggle('vshort', tile.isVeryShort);   // 낮으면 중요도 고르기를 접는다
        // 받는 대상 드롭다운 너비 · 말풍선 바깥 여백은 Swift 와 같은 값
        root.style.setProperty('--tx-dd-w', (tile.isVeryNarrow ? 140 : (tile.isNarrow ? 180 : 260)) + 'px');
        root.style.setProperty('--tx-kind-w', (tile.isVeryNarrow ? 78 : 92) + 'px');
        root.style.setProperty('--tx-gutter', (tile.isVeryNarrow ? 8 : (tile.isNarrow ? 16 : 40)) + 'px');
      }

      // ══ 전체 그리기 ═══════════════════════════════════════════
      function draw() {
        applyTile();
        const t = target();
        ddTargetLabel.textContent = t ? t.label : '받는 대상 선택';

        const n = store.unseenAlertCount;
        badgeEl.hidden = n <= 0;
        badgeEl.textContent = n;
        bellBtn.classList.toggle('on', showAlerts);
        root.classList.toggle('alerts', showAlerts);

        if (showAlerts) {
          drawAlerts();
        } else {
          drawThread();
          syncComposer();
        }
      }

      draw();
      threadEl.scrollTop = threadEl.scrollHeight;

      const off = store.subscribe(() => { draw(); });

      return {
        resize(t) { tile = t; applyTile(); if (!showAlerts) { syncComposer(); } closeMenu(); },
        destroy() { off(); closeMenu();
          document.removeEventListener('mousedown', onDocDown, true);
          document.removeEventListener('keydown', onKeyDown, true); }
      };
    }
  };
})(window.PX);
