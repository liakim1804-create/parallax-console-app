/* 창 관리자 — WindowSystem.swift 를 그대로 옮긴 것.
   자리표(spots), 빈 자리 찾기, 끌어서 붙이기, 경계 끌기, 다시 채우기까지 규칙이 같다.
   좌표는 전부 화면 대비 비율(0~1)이다. */
window.PX = window.PX || {};

(function (PX) {
  'use strict';

  // 탭 (ConsoleTab)
  const TABS = [
    { id: 'overview', name: '전체 상황', short: '전체 상황', icon: 'grid' },
    { id: 'map', name: '작전 지도', short: '작전 지도', icon: 'map' },
    { id: 'space', name: '공간 3D', short: '3D', icon: 'cube' },
    { id: 'transmit', name: '현장 정보 전송', short: '전송', icon: 'message' },
    { id: 'handover', name: '기록·회의록', short: '기록', icon: 'doc' }
  ];
  PX.TABS = TABS;
  PX.tabOf = id => TABS.find(t => t.id === id);

  // ── 사각형 도구 (CGRect 대신) ──
  const R = (x, y, w, h) => ({ x: x, y: y, w: w, h: h });
  const maxX = r => r.x + r.w, maxY = r => r.y + r.h;
  const midX = r => r.x + r.w / 2, midY = r => r.y + r.h / 2;
  const inset = (r, dx, dy) => R(r.x + dx, r.y + dy, Math.max(0, r.w - dx * 2), Math.max(0, r.h - dy * 2));
  const contains = (r, p) => p.x >= r.x && p.x <= maxX(r) && p.y >= r.y && p.y <= maxY(r);
  function overlapArea(a, b) {
    const w = Math.min(maxX(a), maxX(b)) - Math.max(a.x, b.x);
    const h = Math.min(maxY(a), maxY(b)) - Math.max(a.y, b.y);
    return (w > 0 && h > 0) ? w * h : 0;
  }
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  PX.rect = { R: R, maxX: maxX, maxY: maxY, midX: midX, midY: midY, same: same };

  const MIN_PANE_W = 230;   // 칸 하나가 제 구실을 하는 가장 작은 크기 (px)
  const MIN_PANE_H = 170;
  const MIN_PANE = 0.14;    // 비율로 지키는 최소
  const EDGE_EPS = 0.012;
  const MIN_SIDE = 0.18;

  const wm = {
    windows: [],
    focused: 'map',
    resizing: false,
    deskSize: { w: 1200, h: 800 },
    zTop: 20,
    drag: { dragging: null, zone: null },
    _zoneCache: [],
    _subs: new Set(),

    subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
    emit(what) { this._subs.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } }); },

    noteDeskSize(w, h) {
      if (w > 1 && h > 1) { this.deskSize = { w: w, h: h }; }
    },

    /** 지금 화면에서 최소 크기가 차지하는 비율 */
    get minPaneX() { return Math.min(0.45, Math.max(0.12, MIN_PANE_W / this.deskSize.w)); },
    get minPaneY() { return Math.min(0.45, Math.max(0.12, MIN_PANE_H / this.deskSize.h)); },

    get visible() { return this.windows.filter(w => !w.minimized).sort((a, b) => a.z - b.z); },
    get openTabs() { return this.windows.map(w => w.id); },
    isOpen(id) { return this.windows.some(w => w.id === id); },
    win(id) { return this.windows.find(w => w.id === id); },

    /* 한 가지 규칙으로 만든 자리표. 탭 수보다 많이 쪼갤 일은 없다.
         왼쪽 세로 칸(전체 상황 자리) + 오른쪽을 위·아래 두 줄로
         아래 줄을 세 칸까지 채우고, 그다음 위 줄을 세 칸까지 채운다 */
    spots(count) {
      const n = Math.min(Math.max(count, 0), TABS.length);
      const left = 0.25, topH = 0.62, rest = 1 - left;
      const row = (cells, y, h) => {
        if (cells <= 0) return [];
        const w = rest / cells;
        const out = [];
        for (let i = 0; i < cells; i++) out.push(R(left + i * w, y, w, h));
        return out;
      };
      if (n === 0) return [];
      if (n === 1) return [R(0, 0, 1, 1)];
      if (n === 2) return [R(0, 0, 0.3, 1), R(0.3, 0, 0.7, 1)];
      const others = n - 1;
      const bottom = Math.min(3, others - 1);
      const top = others - bottom;
      return [R(0, 0, left, 1)].concat(row(top, 0, topH), row(bottom, topH, 1 - topH));
    },

    defaultLayout() {
      const spots = this.spots(4);
      return ['overview', 'map', 'space', 'transmit'].map((tab, i) => ({
        id: tab, frac: spots[i], z: 11 + i, minimized: false, maximized: false
      }));
    },

    /* 지금 화면이 감당할 수 있는 칸 수.
       아이패드 Split View 가 화면 크기에 따라 두세 개까지만 붙이는 것과 같은 생각이다 */
    get paneCapacity() {
      for (let n = TABS.length; n >= 1; n--) {
        const cells = this.spots(n);
        const narrowest = Math.min.apply(null, cells.map(c => c.w));
        const shortest = Math.min.apply(null, cells.map(c => c.h));
        if (narrowest * this.deskSize.w >= MIN_PANE_W && shortest * this.deskSize.h >= MIN_PANE_H) return n;
      }
      return 1;
    },

    focus(id) {
      const w = this.win(id);
      if (!w) return;
      this.zTop += 1;
      w.z = this.zTop;
      w.minimized = false;
      this.focused = id;
      this.emit('focus');
    },

    toggle(id) { this.isOpen(id) ? this.close(id) : this.open(id); },

    open(id) {
      if (this.isOpen(id)) { this.focus(id); return; }
      // 자리가 모자라면 가장 오래 안 쓴 칸을 작업표시줄로 내린다 (닫지 않는다)
      let guard = 0;
      while (this.windows.filter(w => !w.minimized).length >= this.paneCapacity && guard++ < 10) {
        const oldest = this.windows.filter(w => !w.minimized).sort((a, b) => a.z - b.z)[0];
        if (!oldest) break;
        oldest.minimized = true;
      }
      this.zTop += 1;
      const spot = this._emptySpot(id);
      if (spot) {
        this.windows.push({ id: id, frac: spot, z: this.zTop, minimized: false, maximized: false });
        this._tidyEdges();       // 격자로 찾은 자리라 이웃과 모서리를 맞춰 준다
        this._fillGapsIfNeeded();
      } else {
        this.windows.push({ id: id, frac: R(0.3, 0.25, 0.4, 0.5), z: this.zTop, minimized: false, maximized: false });
        this.reflow();
      }
      this.focused = id;
      this.emit('layout');
    },

    close(id) {
      this.windows = this.windows.filter(w => w.id !== id);
      if (this.focused === id) {
        const v = this.visible;
        this.focused = v.length ? v[v.length - 1].id : 'map';
      }
      this.reflow();
      this.emit('layout');
    },

    toggleMax(id) {
      const w = this.win(id);
      if (!w) return;
      w.maximized = !w.maximized;
      this.focus(id);
      this.emit('layout');
    },

    /* 새 창이 들어갈 자리.
       1) 기본 배치에서 이 앱의 자리가 비어 있으면 그 자리
       2) 아니면 남아 있는 빈 공간 중 가장 넓은 사각형
       3) 빈 곳이 없으면 null — 부르는 쪽이 기본 구성으로 다시 채운다 */
    _emptySpot(id) {
      const taken = this.windows.filter(w => !w.minimized).map(w => w.maximized ? R(0, 0, 1, 1) : w.frac);
      const home = this.defaultLayout().find(w => w.id === id);
      if (home && this._coveredRatio(home.frac, taken) < 0.12) return home.frac;
      const free = this._largestFreeRect(taken);
      if (free && free.w >= 0.2 && free.h >= 0.2) return free;
      return null;
    },

    /** 어떤 자리가 기존 창들에 얼마나 덮여 있는지 (0 = 완전히 빔) */
    _coveredRatio(rect, taken) {
      const area = rect.w * rect.h;
      if (area <= 0) return 1;
      let covered = 0;
      taken.forEach(t => { covered += overlapArea(rect, t); });
      return Math.min(covered / area, 1);
    },

    /** 화면을 격자로 나눠 비어 있는 가장 큰 사각형을 찾는다 */
    _largestFreeRect(taken, grid) {
      const n = grid || 48;
      const free = [];
      for (let r = 0; r < n; r++) free.push(new Array(n).fill(true));
      taken.forEach(t => {
        const c0 = Math.max(0, Math.floor(t.x * n));
        const c1 = Math.min(n - 1, Math.ceil(maxX(t) * n) - 1);
        const r0 = Math.max(0, Math.floor(t.y * n));
        const r1 = Math.min(n - 1, Math.ceil(maxY(t) * n) - 1);
        if (c0 > c1 || r0 > r1) return;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) free[r][c] = false;
      });

      const height = new Array(n).fill(0);
      let bestArea = 0, best = null;
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) height[col] = free[row][col] ? height[col] + 1 : 0;
        const stack = [];
        let col = 0;
        while (col <= n) {
          const h = col === n ? 0 : height[col];
          if (!stack.length || h >= height[stack[stack.length - 1]]) { stack.push(col); col++; }
          else {
            const top = stack.pop();
            const left = stack.length ? stack[stack.length - 1] + 1 : 0;
            const width = col - left;
            const area = height[top] * width;
            if (area > bestArea) {
              bestArea = area;
              best = { top: row - height[top] + 1, left: left, bottom: row, right: left + width - 1 };
            }
          }
        }
      }
      if (!bestArea || !best) return null;
      const cell = 1 / n;
      return R(best.left * cell, best.top * cell,
               (best.right - best.left + 1) * cell, (best.bottom - best.top + 1) * cell);
    },

    /* 열린 창을 자리표에 다시 앉힌다 — 빈 공간이 남지 않는다.
       되도록 지금 있던 자리와 가까운 칸으로 보내 덜 움직이게 한다. */
    reflow() {
      let rest = this.windows.filter(w => !w.minimized);
      if (!rest.length) return;
      let spots = this.spots(rest.length);
      if (!spots.length) return;

      // 전체 상황은 기본 구성대로 왼쪽 칸에 둔다
      if (rest.length >= 3) {
        const ov = rest.find(w => w.id === 'overview');
        if (ov) { ov.frac = spots.shift(); rest = rest.filter(w => w !== ov); }
      }
      const gap = (a, b) => Math.hypot(midX(a) - midX(b), midY(a) - midY(b));
      spots.forEach(spot => {
        if (!rest.length) return;
        let best = rest[0];
        rest.forEach(w => { if (gap(w.frac, spot) < gap(best.frac, spot)) best = w; });
        best.frac = spot;
        rest = rest.filter(w => w !== best);
      });
      this._clampAll();
    },

    /* 놓고 난 자리에 구멍이 남았으면 기본 규칙대로 전부 다시 채운다.
       자리를 맞바꾸거나 반으로 나눠 빈틈이 없을 때는 손대지 않는다 */
    _fillGapsIfNeeded() {
      const taken = this.windows.filter(w => !w.minimized).map(w => w.maximized ? R(0, 0, 1, 1) : w.frac);
      const hole = this._largestFreeRect(taken);
      if (!hole) return;
      if (hole.w * hole.h > 0.01) this.reflow();   // 화면의 1% 를 넘는 구멍만 손본다
    },

    /* 칸이 화면 밖으로 조금이라도 나가면 그 부분은 잘려 보이지 않는다 —
       어떤 계산을 거쳤든 마지막에 화면 안으로 되돌린다 */
    _clampAll() {
      const mx = this.minPaneX, my = this.minPaneY;
      this.windows.forEach(w => {
        if (w.minimized) return;
        const f = w.frac;
        f.w = Math.min(Math.max(f.w, mx), 1);
        f.h = Math.min(Math.max(f.h, my), 1);
        f.x = Math.min(Math.max(0, f.x), 1 - f.w);
        f.y = Math.min(Math.max(0, f.y), 1 - f.h);
      });
    },

    /* 모서리 맞추기.
       빈 자리를 격자로 찾다 보면 이웃 창과 몇 픽셀씩 어긋나 창 사이 여백이 들쭉날쭉해진다.
       가까이 있는 모서리들을 한 값으로 모아 **창 사이 여백을 늘 같게** 만든다. */
    _tidyEdges() {
      const open = this.windows.filter(w => !w.minimized && !w.maximized);
      if (open.length <= 1) return;
      const xs = [], ys = [];
      open.forEach(w => { xs.push(w.frac.x, maxX(w.frac)); ys.push(w.frac.y, maxY(w.frac)); });
      const snapX = cluster(xs), snapY = cluster(ys);
      open.forEach(w => {
        const f = w.frac;
        const x0 = snapTo(f.x, snapX), x1 = snapTo(maxX(f), snapX);
        const y0 = snapTo(f.y, snapY), y1 = snapTo(maxY(f), snapY);
        if (x1 - x0 < MIN_PANE || y1 - y0 < MIN_PANE) return;
        w.frac = R(x0, y0, x1 - x0, y1 - y0);
      });
      this._clampAll();
    },

    /** 혹시 남은 겹침을 정리한다: 빈 자리로 옮기고, 그마저 없으면 작업표시줄로 내린다 */
    _resolveOverlaps(keep) {
      for (let pass = 0; pass < 3; pass++) {
        const clash = this.windows.find(k => {
          if (k.minimized || k.id === keep) return false;
          return this.windows.some(m => m !== k && !m.minimized && ratio(k.frac, m.frac) > 0.2);
        });
        if (!clash) return;
        const taken = this.windows.filter(w => w !== clash && !w.minimized).map(w => w.frac);
        const free = this._largestFreeRect(taken);
        if (free && free.w >= MIN_SIDE && free.h >= MIN_SIDE) {
          clash.frac = free;
          clash.maximized = false;
        } else {
          clash.minimized = true;
        }
      }
    },

    // ── 창과 창 사이 경계 ────────────────────────────────
    /** 지금 배치에서 끌 수 있는 경계들 */
    get dividers() {
      const open = this.windows.filter(w => !w.minimized && !w.maximized);
      if (open.length <= 1) return [];
      const out = [];
      const key = v => Math.round(v * 1000) / 1000;

      const axis = (vertical) => {
        const seen = {};
        open.forEach(w => { seen[key(vertical ? maxX(w.frac) : maxY(w.frac))] = true; });
        Object.keys(seen).map(Number).forEach(p => {
          if (!(p > 0.02 && p < 0.98)) return;
          const before = open.filter(w => Math.abs((vertical ? maxX(w.frac) : maxY(w.frac)) - p) < EDGE_EPS);
          const after = open.filter(w => Math.abs((vertical ? w.frac.x : w.frac.y) - p) < EDGE_EPS);
          if (!before.length || !after.length) return;
          const s = Math.max(
            Math.min.apply(null, before.map(w => vertical ? w.frac.y : w.frac.x)),
            Math.min.apply(null, after.map(w => vertical ? w.frac.y : w.frac.x)));
          const e = Math.min(
            Math.max.apply(null, before.map(w => vertical ? maxY(w.frac) : maxX(w.frac))),
            Math.max.apply(null, after.map(w => vertical ? maxY(w.frac) : maxX(w.frac))));
          if (e - s <= 0.05) return;
          // id 에 위치를 넣으면 끄는 도중 id 가 바뀌어 끌기가 끊긴다 — 이름으로만 만든다
          out.push({
            id: (vertical ? 'v|' : 'h|') + before.map(w => w.id).sort().join(',') +
                '|' + after.map(w => w.id).sort().join(','),
            axis: vertical ? 'v' : 'h', position: p, start: s, end: e,
            before: before.map(w => w.id), after: after.map(w => w.id)
          });
        });
      };
      axis(true); axis(false);
      return out;
    },

    /** 경계를 끌어 양쪽 창을 함께 늘리고 줄인다 (빈 틈이 생기지 않는다) */
    moveDivider(d, raw) {
      const before = this.windows.filter(w => d.before.indexOf(w.id) >= 0);
      const after = this.windows.filter(w => d.after.indexOf(w.id) >= 0);
      if (!before.length || !after.length) return;
      const v = d.axis === 'v';
      const mp = v ? this.minPaneX : this.minPaneY;
      const lower = Math.max.apply(null, before.map(w => (v ? w.frac.x : w.frac.y) + mp));
      const upper = Math.min.apply(null, after.map(w => (v ? maxX(w.frac) : maxY(w.frac)) - mp));
      if (lower >= upper) return;

      // 0.4% 단위로 끊어 다시 그리는 횟수를 반으로 줄인다
      const want = Math.min(Math.max(raw, lower), upper);
      const pos = Math.round(want * 250) / 250;
      if (Math.abs(pos - d.position) <= 0.0005) return;

      if (v) {
        before.forEach(w => { w.frac.w = pos - w.frac.x; });
        after.forEach(w => { const right = maxX(w.frac); w.frac.x = pos; w.frac.w = right - pos; });
      } else {
        before.forEach(w => { w.frac.h = pos - w.frac.y; });
        after.forEach(w => { const bottom = maxY(w.frac); w.frac.y = pos; w.frac.h = bottom - pos; });
      }
      d.position = pos;
      this._clampAll();
      this.emit('frames');
    },

    // ── 끌어서 자리 옮기기 (그리드에 맞춰 붙는다) ──────────
    beginDrag(id) {
      this._zoneCache = this._snapZones(id);
      this.drag.dragging = id;
      this.focus(id);
    },

    /** 끌고 있는 동안, 창 중심이 가리키는 자리를 미리 보여 준다 */
    updateDrag(id, center) {
      const zone = this._snapZone(id, center);
      const now = zone ? zone.rect : null;
      const was = this.drag.zone ? this.drag.zone.rect : null;
      if (!same(now, was)) {
        this.drag.zone = zone;
        this.emit('drag');
      }
    },

    endDrag(id) {
      const zone = this.drag.zone;
      this.drag.zone = null;
      this.drag.dragging = null;
      this._zoneCache = [];
      if (zone) this._place(id, zone);
      this.emit('drag');
      this.emit('layout');
    },

    cancelDrag() {
      this.drag.zone = null;
      this.drag.dragging = null;
      this._zoneCache = [];
      this.emit('drag');
    },

    /** 지금 끌고 있는 창이 놓일 수 있는 자리들 */
    _snapZones(id) {
      const others = this.windows.filter(w => !w.minimized && w.id !== id);
      const zones = [];
      const mx = this.minPaneX, my = this.minPaneY;

      others.forEach(w => {
        const f = w.maximized ? R(0, 0, 1, 1) : w.frac;
        const bandW = f.w * 0.25, bandH = f.h * 0.25;
        // 가운데로 끌면 자리를 맞바꾼다
        zones.push({ rect: f, hit: inset(f, bandW, bandH), owner: w.id, remainder: null });
        // 가장자리로 끌면 그 창을 반으로 나눠 들어간다
        if (f.w / 2 >= mx) {
          const left = R(f.x, f.y, f.w / 2, f.h);
          const right = R(midX(f), f.y, f.w / 2, f.h);
          zones.push({ rect: left, hit: R(f.x, f.y, bandW, f.h), owner: w.id, remainder: right });
          zones.push({ rect: right, hit: R(maxX(f) - bandW, f.y, bandW, f.h), owner: w.id, remainder: left });
        }
        if (f.h / 2 >= my) {
          const top = R(f.x, f.y, f.w, f.h / 2);
          const bottom = R(f.x, midY(f), f.w, f.h / 2);
          zones.push({ rect: top, hit: R(f.x, f.y, f.w, bandH), owner: w.id, remainder: bottom });
          zones.push({ rect: bottom, hit: R(f.x, maxY(f) - bandH, f.w, bandH), owner: w.id, remainder: top });
        }
      });

      // 비어 있는 자리
      const taken = others.map(w => w.maximized ? R(0, 0, 1, 1) : w.frac);
      const free = this._largestFreeRect(taken);
      if (free && free.w >= MIN_SIDE && free.h >= MIN_SIDE) {
        zones.push({ rect: free, hit: free, owner: null, remainder: null });
      }

      // 열린 창이 없으면 기본 배치와 절반·사분면을 쓴다
      if (!others.length) {
        const base = [R(0, 0, 1, 1),
          R(0, 0, 0.5, 1), R(0.5, 0, 0.5, 1),
          R(0, 0, 1, 0.5), R(0, 0.5, 1, 0.5),
          R(0, 0, 0.5, 0.5), R(0.5, 0, 0.5, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5)];
        const home = this.defaultLayout().find(w => w.id === id);
        if (home) base.unshift(home.frac);
        base.forEach(r => zones.push({ rect: r, hit: r, owner: null, remainder: null }));
      }
      return zones;
    },

    /* 창 중심이 들어 있는 자리 중 가장 작은 것.
       손끝이 어느 자리에도 없으면 미리보기를 띄우지 않는다 — 먼 자리를 억지로 고르면 화면이 튄다 */
    _snapZone(id, center) {
      const zones = this._zoneCache.length ? this._zoneCache : this._snapZones(id);
      const inside = zones.filter(z => contains(z.hit, center));
      if (!inside.length) return null;
      return inside.reduce((a, b) => (a.hit.w * a.hit.h < b.hit.w * b.hit.h ? a : b));
    },

    /** 자리 배치. 맞부딪힌 창은 자리를 바꾸거나 남은 반쪽으로 물러난다 (겹치지 않게) */
    _place(id, zone) {
      const w = this.win(id);
      if (!w) return;
      const origin = w.frac;
      w.frac = Object.assign({}, zone.rect);
      w.maximized = false;
      if (zone.owner) {
        const o = this.win(zone.owner);
        if (o) { o.frac = Object.assign({}, zone.remainder || origin); o.maximized = false; }
      }
      this._resolveOverlaps(id);
      this._tidyEdges();
      this._fillGapsIfNeeded();
    },

    // ── 작업표시줄 단추 ──────────────────────────────────
    resetLayout() {
      this.windows = this.defaultLayout();
      this.zTop = 20;
      this.focused = 'map';
      this.emit('layout');
    },

    tile(count) {
      const ids = this.visible.slice(-count).map(w => w.id);
      const spots = count === 2
        ? [R(0, 0, 0.5, 1), R(0.5, 0, 0.5, 1)]
        : [R(0, 0, 0.5, 0.5), R(0.5, 0, 0.5, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5)];
      ids.forEach((id, n) => {
        if (n >= spots.length) return;
        const w = this.win(id);
        if (w) { w.frac = Object.assign({}, spots[n]); w.maximized = false; w.minimized = false; }
      });
      this.emit('layout');
    },

    cycleFocus(step) {
      const opened = this.windows.filter(w => !w.minimized).map(w => w.id);
      if (!opened.length) return;
      const i = Math.max(0, opened.indexOf(this.focused));
      this.focus(opened[(i + step + opened.length) % opened.length]);
    }
  };

  /** 가까운 값들을 한 덩어리로 묶어 대표값을 낸다. 화면 끝(0, 1)은 그대로 둔다 */
  function cluster(values, tolerance) {
    const tol = tolerance == null ? 0.03 : tolerance;
    const sorted = values.slice().sort((a, b) => a - b);
    const out = [];
    let group = [];
    const flush = () => {
      if (!group.length) return;
      if (group.some(v => v < 0.004)) out.push(0);
      else if (group.some(v => v > 0.996)) out.push(1);
      else out.push(group.reduce((a, b) => a + b, 0) / group.length);
      group = [];
    };
    sorted.forEach(v => {
      if (group.length && v - group[group.length - 1] > tol) flush();
      group.push(v);
    });
    flush();
    return out;
  }
  function snapTo(v, values) {
    let best = v, bestD = Infinity;
    values.forEach(x => { const d = Math.abs(x - v); if (d < bestD) { bestD = d; best = x; } });
    return best;
  }
  /** 두 자리가 얼마나 겹치는지 (작은 쪽 기준) */
  function ratio(a, b) {
    const o = overlapArea(a, b);
    if (!o) return 0;
    const smaller = Math.min(a.w * a.h, b.w * b.h);
    return smaller > 0 ? o / smaller : 0;
  }

  wm.windows = wm.defaultLayout();
  PX.wm = wm;
})(window.PX);
