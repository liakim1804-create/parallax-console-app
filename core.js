/* 공용 도구와 상태.
   ConsoleStore.swift(SampleData.swift 안) 와 TileMetrics.swift 를 옮긴 것.
   SwiftUI 는 @Published 가 바뀌면 화면이 저절로 다시 그려지지만 여기서는 그런 것이 없어,
   상태를 바꾼 쪽이 store.emit() 으로 알리고 화면들이 구독해서 다시 그린다. */
window.PX = window.PX || {};

(function (PX) {
  'use strict';

  // ── 작은 도구들 ───────────────────────────────────────
  PX.$ = (sel, root) => (root || document).querySelector(sel);
  PX.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  PX.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 아이콘 한 개. SF Symbols 대신 index.html 의 스프라이트를 쓴다 */
  PX.icon = (name, cls) => `<svg class="ic ${cls || ''}" aria-hidden="true"><use href="#ic-${name}"/></svg>`;

  PX.el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  PX.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** "20:41" → 자정부터 분 */
  PX.hm = s => {
    const p = String(s || '').split(':');
    return p.length === 2 ? (+p[0]) * 60 + (+p[1]) : 0;
  };
  /** 분 → "20:41" */
  PX.clockText = m => {
    const t = Math.max(0, Math.round(m));
    return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  };
  PX.now = (withSec) => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + (withSec ? ':' + p(d.getSeconds()) : '');
  };

  /** 중요도 → 색 이름 (Theme.color) */
  PX.prio = p => (p === '긴급' ? 'urgent' : p === '주의' ? 'caution' : 'normal');
  PX.dot = (p, size) => `<span class="dot ${PX.prio(p)}"${size ? ` style="width:${size}px;height:${size}px"` : ''}></span>`;

  // ── 창 크기에 따른 규칙 (TileMetrics.swift) ─────────────
  // 각 화면이 이 값을 보고 내용을 줄이거나 바꾼다.
  PX.tile = (w, h) => ({
    width: w, height: h,
    isNarrow: w < 520,        // 보조 정보 줄이기
    isVeryNarrow: w < 360,    // 한 줄에 한 가지만
    isTiny: w < 300,          // 제목·라벨까지 떨어내고 아이콘만
    isShort: h < 360,         // 목록·여백 줄이기
    isVeryShort: h < 240,     // 핵심만 남기기
    isTinyHeight: h < 190,    // 머리글도 접는다
    get inset() { return this.isTiny ? 8 : (this.isVeryNarrow ? 10 : 14); },
    get blockGap() { return this.isShort ? 12 : 20; }
  });

  // ── 콘솔 전체가 함께 보는 상태 (ConsoleStore) ───────────
  const D = PX.data;
  const store = {
    incidents: D.incidents.slice(),
    officers: D.officers.map(o => Object.assign({}, o)),
    vehicles: D.vehicles.map(v => Object.assign({}, v)),
    cameras: D.cameras.slice(),
    caseGroups: D.caseGroups.slice(),
    messages: D.messages.map(m => Object.assign({ id: 'm' + Math.random().toString(36).slice(2, 9) }, m)),
    alerts: D.alerts.map(a => Object.assign({ id: 'a' + Math.random().toString(36).slice(2, 9) }, a)),

    selectedIncidentID: (D.initial && D.initial.selectedIncidentID) || 'A-102',
    darkMode: !!(D.initial && D.initial.darkMode),
    soundOn: D.initial ? D.initial.soundOn !== false : true,

    drafts: {},
    stageIndex: Object.assign({}, D.stageIndex || {}),
    txItems: new Set(),
    txTargets: new Set(),
    txNote: '',
    txSent: [],
    handoverDone: new Set(),

    // 구독 — SwiftUI 의 @Published 자리
    _subs: new Set(),
    subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
    emit(what) { this._subs.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } }); },

    get selectedIncident() {
      return this.incidents.find(i => i.id === this.selectedIncidentID) || this.incidents[0];
    },
    get activeIncidents() { return this.incidents.filter(i => i.status !== '종료'); },
    get unseenAlertCount() { return this.alerts.filter(a => !a.seen && !a.isMine).length; },

    officersOf(inc) { return this.officers.filter(o => o.incidentID === inc); },
    vehiclesOf(inc) { return this.vehicles.filter(v => v.incidentID === inc); },
    camerasOf(inc) { return this.cameras.filter(c => c.incidentID === inc); },
    caseGroupOf(inc) { return this.caseGroups.find(g => g.reportIDs.indexOf(inc) >= 0); },

    select(id) {
      if (this.selectedIncidentID === id) return;
      this.selectedIncidentID = id;
      this.emit('incident');
    },

    // ── 메시지 ──
    thread(target) {
      return this.messages.filter(m => target.names.indexOf(m.to) >= 0 || target.names.indexOf(m.from) >= 0);
    },

    send(target, text, kind) {
      const body = String(text || '').trim();
      if (!body) return;
      const msg = {
        id: 'm' + Math.random().toString(36).slice(2, 9),
        incidentID: this.selectedIncidentID, from: '지휘통제실', to: target.sendName,
        kind: kind || '일반', text: body, time: PX.now(), isRead: false, isMine: true, isPinned: false
      };
      this.messages.push(msg);
      this.drafts[target.id] = '';
      if (kind && kind !== '일반') {
        this.alerts.unshift({
          id: 'a' + Math.random().toString(36).slice(2, 9),
          level: kind === '긴급' ? '긴급' : '주의',
          title: kind === '긴급' ? '긴급 지시 발신' : '중요 지시 발신',
          detail: target.label + ' 대상: ' + body,
          time: PX.now(true), incidentID: this.selectedIncidentID, seen: true, isMine: true
        });
      }
      this.emit('messages');
      // 잠시 뒤 상대가 확인하고 답신한다 (가상 동작)
      setTimeout(() => { msg.isRead = true; this.emit('messages'); }, 2200);
      setTimeout(() => {
        const replies = ['수신했습니다.', '확인했습니다. 조치하겠습니다.', '내용 확인. 진행 중입니다.'];
        const from = target.isGroup ? (target.members[0] || '현장 경찰') : target.sendName;
        this.messages.push({
          id: 'm' + Math.random().toString(36).slice(2, 9),
          incidentID: this.selectedIncidentID, from: from,
          to: target.isGroup ? target.sendName : '지휘통제실',
          kind: '일반', text: replies[Math.floor(Math.random() * replies.length)],
          time: PX.now(), isRead: false, isMine: false, isPinned: false
        });
        this.emit('messages');
      }, 4200);
    },

    markRead(id) {
      const m = this.messages.find(x => x.id === id);
      if (m) { m.isRead = true; this.emit('messages'); }
    },
    togglePin(id) {
      const m = this.messages.find(x => x.id === id);
      if (m) { m.isPinned = !m.isPinned; this.emit('messages'); }
    },
    markAllAlertsSeen() { this.alerts.forEach(a => { a.seen = true; }); this.emit('alerts'); },

    // ── 인력·차량 배정 ──
    assignOfficer(id, inc) {
      const o = this.officers.find(x => x.id === id);
      if (o) { o.incidentID = inc; this.emit('units'); }
    },
    unassignOfficer(id) {
      const o = this.officers.find(x => x.id === id);
      if (o) { o.incidentID = null; this.emit('units'); }
    },
    assignVehicle(id, inc) {
      const v = this.vehicles.find(x => x.id === id);
      if (v) { v.incidentID = inc; this.emit('units'); }
    },
    unassignVehicle(id) {
      const v = this.vehicles.find(x => x.id === id);
      if (v) { v.incidentID = null; this.emit('units'); }
    },

    // ── 사건 처리 단계 ──
    stageOf(inc) { return this.stageIndex[inc] || 0; },
    nextStage(inc) {
      const n = this.stageOf(inc);
      if (n < PX.data.stages.length - 1) { this.stageIndex[inc] = n + 1; this.emit('stage'); }
    },
    prevStage(inc) {
      const n = this.stageOf(inc);
      if (n > 0) { this.stageIndex[inc] = n - 1; this.emit('stage'); }
    },

    // ── 현장 정보 전송 ──
    sendTransmission() {
      if (!this.txItems.size || !this.txTargets.size) return;
      const items = Array.from(this.txItems).sort();
      const targets = Array.from(this.txTargets).sort();
      const rec = { items: items, targets: targets, note: this.txNote, time: PX.now() };
      this.txSent.unshift(rec);
      targets.forEach(t => {
        this.messages.push({
          id: 'm' + Math.random().toString(36).slice(2, 9),
          incidentID: this.selectedIncidentID, from: '지휘통제실', to: t, kind: '중요',
          text: '[현장 전송] ' + items.join(' · ') + (rec.note ? ' / ' + rec.note : ''),
          time: rec.time, isRead: false, isMine: true, isPinned: false
        });
      });
      this.alerts.unshift({
        id: 'a' + Math.random().toString(36).slice(2, 9),
        level: '주의', title: '현장 정보 전송',
        detail: items.join(' · ') + ' 을(를) 전달했습니다.',
        time: PX.now(true), incidentID: this.selectedIncidentID, seen: true, isMine: true
      });
      this.txItems.clear(); this.txTargets.clear(); this.txNote = '';
      this.emit('transmit');
    },

    // ── 받는 대상 목록 (현장팀 / 후속팀 / 상황실 내부) ──
    get chatTargets() {
      const field = this.officersOf(this.selectedIncidentID);
      const backup = this.officers.filter(o => !o.incidentID);
      const team = (name, units, legacy) => {
        if (!units.length) return [];
        const groupName = name + ' 전체';
        return [{
          id: 'g:' + name, label: groupName + ' · ' + units.length + '개 팀', sendName: groupName,
          isGroup: true, names: [groupName].concat(legacy), members: units.map(u => u.call)
        }].concat(units.map(o => ({
          id: 'u:' + o.call, label: o.call + ' ' + o.name, sendName: o.call,
          isGroup: false, names: [o.call], members: [o.call]
        })));
      };
      return [
        { title: '현장팀', targets: team('현장팀', field, ['현장 경찰', '전체 현장 인력']) },
        { title: '후속팀', targets: team('후속팀', backup, ['후속 인력']) },
        { title: '상황실 내부', targets: [] }
      ];
    }
  };

  PX.store = store;

  // 화면 등록소. 각 screen-*.js 가 여기에 자기를 넣는다.
  // { mount(bodyEl, ctx) → 인스턴스, 인스턴스는 resize(tile)/destroy() 를 가질 수 있다 }
  PX.screens = {};
})(window.PX);
