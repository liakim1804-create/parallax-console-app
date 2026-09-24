/* 작전 지도 — MapScreen.swift + MapSupport.swift 를 옮긴 것.

   애플 지도(MapKit)는 브라우저에서 쓸 수 없다(유료 키가 필요하다).
   그래서 MapLibre + OpenFreeMap 벡터 타일로 대신하되, **보이는 것과 동작은 Swift 판에 맞춘다** —
   주변 장소(POI) 표시를 끄고 길·행정구역 이름만 남기고, 3D 는 카메라를 기울여 건물을 세운다. */
(function (PX) {
  'use strict';

  const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  // 다크 모드에서는 지도도 같이 어두워져야 한다 — 맥 판은 애플 지도가 알아서 뒤집힌다
  const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const SEOUL = { center: [126.978, 37.5665], zoom: 12.4 };

  const KINDS = [
    { id: 'standard', name: '기본', icon: 'map' },
    { id: 'satellite', name: '위성', icon: 'globe' },
    { id: 'threeD', name: '3D', icon: 'cube' }
  ];

  const COLOR = { incident: '#ff3b30', unit: '#007aff', camera: '#5a57d6' };
  const SYMBOL = { incident: 'exclaim', unit: 'officer', camera: 'cctv', car: 'car' };

  const ll = p => PX.data.mapPoint.toLatLng(p);          // {x,y} → {latitude, longitude}
  const lngLat = p => { const c = ll(p); return [c.longitude, c.latitude]; };

  // ═══ 상황 재생 시계 (OpsClock) ═══════════════════════
  //  지금까지 지도는 21:00 에 얼어붙어 있었다. 시계를 붙이면 상황이 흐른다.
  function makeClock() {
    const nowMin = PX.data.clock.nowMin;
    return {
      now: nowMin,
      playing: false,
      // 느려야 인력이 어디로 가는지 눈으로 따라갈 수 있다 — 0.25 면 20 분을 80 초에 걸쳐 본다
      speed: 0.25,
      span: [nowMin - 30, nowMin],
      timer: null,
      onTick: null,
      get isLive() { return this.now >= this.span[1] - 0.01; },
      get label() { return PX.clockText(this.now); },
      /** 고른 사건이 바뀌면 그 접수 시각부터 흐르게 맞춘다 (범위가 너무 짧으면 최소 20분) */
      retarget(reportedAt) {
        const from = PX.hm(reportedAt), upper = nowMin;
        this.span = [Math.min(from, upper - 20), upper];
        this.now = Math.min(Math.max(this.now, this.span[0]), this.span[1]);
      },
      goLive() { this.stop(); this.now = this.span[1]; if (this.onTick) this.onTick(); },
      replay() { this.now = this.span[0]; this.play(); },
      play() {
        if (this.playing) return;
        if (this.isLive) this.now = this.span[0];      // 끝에서 누르면 처음으로
        this.playing = true;
        const step = 1 / 10;                            // 1초에 열 번 — 부드럽고 무겁지 않다
        this.timer = setInterval(() => {
          this.now += this.speed * step;
          if (this.now >= this.span[1]) { this.now = this.span[1]; this.stop(); }
          if (this.onTick) this.onTick();
        }, step * 1000);
      },
      stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.playing = false;
        if (this.onTick) this.onTick();
      },
      toggle() { this.playing ? this.stop() : this.play(); }
    };
  }

  /** 경로 위 그 시각의 자리 — 소수 분을 받아 인력이 뚝뚝 끊기지 않고 미끄러지게 */
  function routePoint(r, t) {
    const s = r.stops;
    if (!s.length) return null;
    if (t <= s[0].t) return s[0].p;
    if (t >= s[s.length - 1].t) return s[s.length - 1].p;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k };
      }
    }
    return s[s.length - 1].p;
  }
  /** 그 시각까지 지나온 길. 아직 안 간 곳은 그리지 않는다 */
  function routeTravelled(r, t) {
    const s = r.stops;
    if (!s.length || t <= s[0].t) return [];
    const pts = [s[0].p];
    s.slice(1).forEach(x => { if (x.t <= t) pts.push(x.p); });
    const head = routePoint(r, t);
    const last = pts[pts.length - 1];
    if (head && (head.x !== last.x || head.y !== last.y)) pts.push(head);
    return pts.map(lngLat);
  }
  const routeOf = id => PX.data.patrolRoutes.find(r => r.id === id);

  // ═══ 묶기 (MapClustering) ═════════════════════════════
  //  화면 48px 에 해당하는 위경도 거리로 묶는다 (확대하면 자연히 풀린다)
  function clusterItems(items, lonSpan, viewWidth) {
    if (!viewWidth) return items.map(i => ({ items: [i] }));
    const radius = lonSpan * (48 / viewWidth);
    const out = [];
    items.forEach(item => {
      const hit = out.find(c => {
        const p = center(c);
        const dx = p[0] - item.lngLat[0];
        const dy = (p[1] - item.lngLat[1]) * 1.3;    // 위도 1도가 경도보다 길다
        return Math.sqrt(dx * dx + dy * dy) < radius;
      });
      if (hit) hit.items.push(item); else out.push({ items: [item] });
    });
    return out;
  }
  function center(c) {
    if (c.items.length === 1) return c.items[0].lngLat;
    let x = 0, y = 0;
    c.items.forEach(i => { x += i.lngLat[0]; y += i.lngLat[1]; });
    return [x / c.items.length, y / c.items.length];
  }
  const clusterID = c => c.items.map(i => i.id).sort().join(',');

  // ═══ 화면 ════════════════════════════════════════════
  function mount(body, ctx) {
    const store = ctx.store;
    let tile = ctx.tile;

    const S = {
      kind: 'standard',
      showKindMenu: false,
      showIncidents: false,
      showUnits: false,
      showCameras: false,
      sidebarOpen: true,
      caseListOpen: true,
      openedCase: null,
      hoveredItemID: null,
      selectedRowID: null,
      query: '',
      results: [],
      searchPin: null,
      popoverCamera: null,
      briefIncident: null,
      arMode: 'off'          // off | pip | full
    };
    const clock = makeClock();

    body.classList.add('mp-root');
    body.innerHTML =
      `<div class="mp-canvas"></div>
       <div class="mp-markers"></div>
       <aside class="mp-sidebar glass"></aside>
       <button class="mp-toggle glass" title="사이드바 펼치기">${PX.icon('sidebar')}</button>
       <div class="mp-controls"></div>
       <div class="mp-cards"></div>
       <div class="mp-play glass"></div>
       <div class="mp-ar"></div>`;

    const canvasEl = body.querySelector('.mp-canvas');
    const markerEl = body.querySelector('.mp-markers');
    const sideEl = body.querySelector('.mp-sidebar');
    const toggleEl = body.querySelector('.mp-toggle');
    const ctlEl = body.querySelector('.mp-controls');
    const cardEl = body.querySelector('.mp-cards');
    const playEl = body.querySelector('.mp-play');
    const arEl = body.querySelector('.mp-ar');

    // ── 지도 ──
    const map = new maplibregl.Map({
      container: canvasEl,
      style: STYLE,
      center: SEOUL.center,
      zoom: SEOUL.zoom,
      attributionControl: { compact: true }
    });
    // 나침반과 확대는 정품 컨트롤이 맡는다 — 나침반을 누르면 북으로 돌아간다
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    const geo = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserLocation: true
    });
    map.addControl(geo, 'bottom-right');

    let styleReady = false;
    function setupStyle() {
      hidePOI();
      addSatellite();
      addLineLayers();
      styleReady = true;
      applyKind(S.kind);
      drawAll();
    }
    map.on('load', setupStyle);
    /* 스타일을 갈아 끼우면 우리가 얹은 선(경로·관계선)과 위성 층이 전부 날아간다.
       그래서 새 스타일이 올라올 때마다 처음부터 다시 세운다. */
    function swapStyle(dark) {
      styleReady = false;
      map.setStyle(dark ? STYLE_DARK : STYLE);
      map.once('style.load', setupStyle);
    }
    map.on('move', () => { drawMarkers(); drawCards(); });
    map.on('render', () => { drawCards(); });

    /* 주변 장소(상점·병원·역 등) 표시는 모두 끈다 — 사건 표식과 섞여 읽기 어렵다.
       길·대로·행정구역 이름은 그대로 남는다. */
    function hidePOI() {
      map.getStyle().layers.forEach(l => {
        if (/poi/i.test(l.id)) map.setLayoutProperty(l.id, 'visibility', 'none');
      });
      koreanLabels();
    }

    /* 글자는 한국어로. 타일은 영어 이름을 기본으로 주므로 name:ko 가 있으면 그것을 쓴다 —
       애플 지도처럼 「퇴계로」로 보여야지 「Toegye-ro」가 섞이면 읽기 나쁘다 */
    function koreanLabels() {
      map.getStyle().layers.forEach(l => {
        if (l.type !== 'symbol') return;
        const f = (l.layout || {})['text-field'];
        if (!f) return;
        try {
          map.setLayoutProperty(l.id, 'text-field',
            ['coalesce', ['get', 'name:ko'], ['get', 'name:latin'], ['get', 'name']]);
        } catch (e) { /* 이 층은 이름을 안 쓴다 */ }
      });
    }

    /* 위성은 스타일을 통째로 갈지 않고 **밑에 깔기만** 한다.
       스타일을 바꾸면 우리가 얹은 선과 표식이 전부 날아가 다시 만들어야 한다. */
    function addSatellite() {
      map.addSource('sat', { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 19 });
      const first = map.getStyle().layers[0];
      map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } }, first.id);
    }

    function addLineLayers() {
      map.addSource('tracks', { type: 'geojson', data: empty() });
      map.addSource('links', { type: 'geojson', data: empty() });
      map.addLayer({
        id: 'links', type: 'line', source: 'links',
        paint: {
          'line-width': 3,
          'line-color': ['case', ['get', 'report'], '#ff3b30', '#007aff']
        },
        layout: { 'line-cap': 'round' }
      });
      // 지나온 길 — 점점 자라는 선이 곧 「움직임」이다
      map.addLayer({
        id: 'tracks', type: 'line', source: 'tracks',
        paint: { 'line-width': 3, 'line-color': '#007aff', 'line-opacity': 0.75 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });
    }
    const empty = () => ({ type: 'FeatureCollection', features: [] });

    /* 지도 종류를 바꿀 때 카메라도 같이 맞춘다.
       3D 는 스타일만 바꿔서는 평면과 똑같아 보인다 — 카메라를 기울여야 건물이 선다. */
    function applyKind(k) {
      if (!styleReady) return;
      S.kind = k;
      const sat = k === 'satellite';
      map.setLayoutProperty('sat', 'visibility', sat ? 'visible' : 'none');
      // 위성일 때는 벡터 바탕(땅·물·건물·길)을 감추고 글자만 남긴다
      map.getStyle().layers.forEach(l => {
        if (l.id === 'sat' || l.id === 'tracks' || l.id === 'links') return;
        if (/poi/i.test(l.id)) return;
        if (l.type === 'symbol') return;
        map.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible');
      });
      map.easeTo({ pitch: k === 'threeD' ? 60 : 0, duration: 700 });
      draw3DBuildings(k === 'threeD');
      drawControls();
    }

    function draw3DBuildings(on) {
      const has = map.getLayer('px-3d');
      if (!on) { if (has) map.setLayoutProperty('px-3d', 'visibility', 'none'); return; }
      if (has) { map.setLayoutProperty('px-3d', 'visibility', 'visible'); return; }
      if (!map.getSource('openmaptiles')) return;
      try {
        map.addLayer({
          id: 'px-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': '#c9ccd4',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.75
          }
        });
      } catch (e) { /* 스타일에 건물 자료가 없으면 그냥 평면으로 둔다 */ }
    }

    // ── 표식 목록 (items / focusItems) ──
    /** 그 시각의 인력 자리. 아직 출동 전이면 지도에 세우지 않는다(null) */
    function officerPoint(o) {
      const r = routeOf(o.id);
      if (!r) return o.point;                       // 경로가 없는 인력(대기 등)은 늘 제자리
      if (clock.now < r.stops[0].t) return null;
      return routePoint(r, clock.now);
    }
    /** 되감아 보는 동안에만 지나온 길을 남긴다 — 「지금」 화면은 평소와 똑같아야 한다 */
    const showsTracks = () => clock.playing || !clock.isLive;

    /** 지금 지도에 세우기로 한 인력 (사건을 열었으면 그 사건 것만) */
    function shownOfficers() {
      if (S.openedCase) {
        return store.officers.filter(o => o.incidentID && S.openedCase.reportIDs.indexOf(o.incidentID) >= 0);
      }
      return S.showUnits ? store.officers : [];
    }
    function trackRoutes() {
      if (!showsTracks() || (!S.showUnits && !S.openedCase)) return [];
      const shown = shownOfficers().map(o => o.id);
      return PX.data.patrolRoutes.filter(r => shown.indexOf(r.id) >= 0 && clock.now > r.stops[0].t);
    }

    const item = (id, kind, label, p, incidentID, symbol) =>
      ({ id: id, kind: kind, label: label, lngLat: lngLat(p), incidentID: incidentID, symbol: symbol });

    function items() {
      let list = [];
      if (S.showIncidents) {
        store.incidents.filter(i => i.status !== '종료').forEach(i =>
          list.push(item(i.id, 'incident', i.id + ' ' + i.type, i.point, i.id, 'incident')));
      }
      if (S.showUnits) {
        store.officers.forEach(o => {
          const p = officerPoint(o);
          if (!p) return;                            // 아직 출동 전
          list.push(item(o.id, 'unit', o.call + ' ' + o.name, p, o.incidentID, 'officer'));
        });
        store.vehicles.forEach(v => list.push(item(v.id, 'unit', v.label, v.point, v.incidentID, 'car')));
      }
      if (S.showCameras) {
        store.cameras.forEach(c => list.push(item(c.id, 'camera', c.id + ' ' + c.name, c.point, c.incidentID, 'camera')));
      }
      // 사건을 열면 그 사건 항목은 묶지 않고 따로 또렷하게 보여 준다
      if (S.openedCase) {
        const have = {};
        list.forEach(i => { have[i.id] = true; });
        focusItems(S.openedCase).forEach(i => { if (!have[i.id]) list.push(i); });
      }
      return list;
    }

    function focusItems(group) {
      const list = [];
      group.reportIDs.forEach(rid => {
        const inc = store.incidents.find(i => i.id === rid);
        if (inc) list.push(item(inc.id, 'incident', inc.id + ' ' + inc.type, inc.point, inc.id, 'incident'));
        store.officers.filter(o => o.incidentID === rid).forEach(o => {
          const p = officerPoint(o);
          if (p) list.push(item(o.id, 'unit', o.call + ' ' + o.name, p, rid, 'officer'));
        });
        store.vehiclesOf(rid).forEach(v => list.push(item(v.id, 'unit', v.label, v.point, rid, 'car')));
        store.camerasOf(rid).forEach(c => list.push(item(c.id, 'camera', c.id + ' ' + c.name, c.point, rid, 'camera')));
      });
      return list;
    }
    const focusIDs = g => focusItems(g).map(i => i.id);

    function clusters() {
      const w = body.clientWidth;
      const b = map.getBounds();
      const lonSpan = Math.abs(b.getEast() - b.getWest());
      if (!S.openedCase) return clusterItems(items(), lonSpan, w);
      const ids = focusIDs(S.openedCase);
      const others = items().filter(i => ids.indexOf(i.id) < 0);
      return clusterItems(others, lonSpan, w).concat(focusItems(S.openedCase).map(i => ({ items: [i] })));
    }
    const isDimmed = c => S.openedCase ? focusIDs(S.openedCase).indexOf(c.items[0].id) < 0 : false;
    const isHighlighted = c => c.items.length === 1 &&
      (c.items[0].id === S.hoveredItemID || c.items[0].id === S.selectedRowID);

    // ── 표식 그리기 ──
    const markerCache = {};
    function drawMarkers() {
      if (!styleReady) return;
      const list = clusters();
      const seen = {};
      list.forEach(c => {
        const id = clusterID(c);
        seen[id] = true;
        let el = markerCache[id];
        if (!el) {
          el = document.createElement('button');
          el.className = 'mp-mark';
          el.addEventListener('click', ev => { ev.stopPropagation(); tap(c); });
          el.addEventListener('dblclick', ev => { ev.stopPropagation(); openBrief(c); });
          el.addEventListener('mouseenter', () => { S.hoveredItemID = c.items[0].id; });
          el.addEventListener('mouseleave', () => { if (S.hoveredItemID === c.items[0].id) S.hoveredItemID = null; });
          el.addEventListener('contextmenu', ev => { ev.preventDefault(); markerMenu(c, ev); });
          markerEl.appendChild(el);
          markerCache[id] = el;
        }
        el.__cluster = c;
        const group = c.items.length > 1;
        const kind = c.items[0].kind;
        const side = group ? (c.items.length >= 10 ? 46 : c.items.length >= 5 ? 40 : 34) : 28;
        const radius = (kind === 'camera' && !group) ? 9 : side / 2;
        el.style.width = el.style.height = side + 'px';
        el.style.borderRadius = radius + 'px';
        el.style.background = COLOR[kind];
        el.style.opacity = isDimmed(c) ? 0.3 : 1;
        el.style.setProperty('--halo', group ? COLOR[kind] + '48' : 'transparent');
        el.classList.toggle('big', isHighlighted(c));
        el.innerHTML = group
          ? `<b style="font-size:${c.items.length >= 10 ? 15 : 13}px">${c.items.length}</b>`
          : PX.icon(SYMBOL[c.items[0].symbol] || 'pin');
        const pt = map.project(center(c));
        el.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
        el.title = c.items.length === 1 ? c.items[0].label : c.items.length + '개';
      });
      Object.keys(markerCache).forEach(id => {
        if (!seen[id]) { markerCache[id].remove(); delete markerCache[id]; }
      });

      // 검색으로 찍은 자리
      let pin = markerEl.querySelector('.mp-searchpin');
      if (S.searchPin) {
        if (!pin) {
          pin = PX.el(`<div class="mp-searchpin">${PX.icon('pin')}</div>`);
          markerEl.appendChild(pin);
        }
        const pt = map.project(S.searchPin);
        pin.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -100%)`;
      } else if (pin) pin.remove();
    }

    // ── 선 (배정 관계선 · 지나온 길) ──
    function drawLines() {
      if (!styleReady) return;
      /* 배정 관계선: 인력·차량 → 신고 위치(파란 실선), 묶인 신고끼리(빨간 실선).
         되감는 동안에는 그리지 않는다 — 이동 경로와 같은 파란 직선이라 서로 헷갈린다 */
      const links = [];
      if (S.openedCase && !showsTracks()) {
        const g = S.openedCase;
        g.reportIDs.forEach(rid => {
          const inc = store.incidents.find(i => i.id === rid);
          if (!inc) return;
          store.officersOf(rid).forEach(o => links.push(line([lngLat(o.point), lngLat(inc.point)], false)));
          store.vehiclesOf(rid).forEach(v => links.push(line([lngLat(v.point), lngLat(inc.point)], false)));
        });
        const reports = g.reportIDs.map(id => store.incidents.find(i => i.id === id)).filter(Boolean);
        for (let i = 1; i < reports.length; i++) {
          links.push(line([lngLat(reports[i - 1].point), lngLat(reports[i].point)], true));
        }
      }
      map.getSource('links').setData({ type: 'FeatureCollection', features: links });

      const tracks = trackRoutes().map(r => routeTravelled(r, clock.now))
        .filter(c => c.length > 1).map(c => line(c, false));
      map.getSource('tracks').setData({ type: 'FeatureCollection', features: tracks });
    }
    const line = (coords, report) => ({
      type: 'Feature', properties: { report: !!report },
      geometry: { type: 'LineString', coordinates: coords }
    });

    // 묶인 신고 사이에 붙는 「연관 신고」 딱지
    function drawPairLabels() {
      PX.$$('.mp-pair', markerEl).forEach(e => e.remove());
      if (!S.openedCase || showsTracks()) return;
      const reports = S.openedCase.reportIDs.map(id => store.incidents.find(i => i.id === id)).filter(Boolean);
      for (let i = 1; i < reports.length; i++) {
        const a = ll(reports[i - 1].point), b = ll(reports[i].point);
        const pt = map.project([(a.longitude + b.longitude) / 2, (a.latitude + b.latitude) / 2]);
        const el = PX.el(`<span class="mp-pair">연관 신고</span>`);
        el.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
        markerEl.appendChild(el);
      }
    }

    // ── 카메라 이동 ──
    function fly(lonlat, zoomIn) {
      backToMap();
      map.easeTo({ center: lonlat, zoom: zoomIn ? Math.max(map.getZoom(), 15.2) : map.getZoom(), duration: 800 });
    }
    /** 3D 를 보던 중에 사건·인력·CCTV 를 고르면 지도로 돌아와 그 자리를 비춘다 */
    function backToMap() {
      S.briefIncident = null;
      if (S.arMode !== 'off') { S.arMode = 'off'; drawAR(); }
    }
    /** 묶음을 누르면 1~2.5단계만 확대해 맥락을 잃지 않게 한다 */
    function zoomTo(c) {
      const lons = c.items.map(i => i.lngLat[0]), lats = c.items.map(i => i.lngLat[1]);
      const pad = 1.6;
      const w = Math.max((Math.max.apply(null, lons) - Math.min.apply(null, lons)) * pad, 0.004);
      const h = Math.max((Math.max.apply(null, lats) - Math.min.apply(null, lats)) * pad, 0.004);
      const cur = map.getBounds();
      const span = Math.abs(cur.getEast() - cur.getWest());
      const want = Math.min(Math.max(Math.max(w, h), span / 2.5), span / 2);
      const zoom = map.getZoom() + Math.log2(span / want);
      map.easeTo({ center: center(c), zoom: Math.min(zoom, 19), duration: 700 });
    }
    /* 점들이 모두 보이게 지도를 맞춘다.
       사이드바와 떠 있는 조작부가 덮는 만큼은 여백으로 빼 줘야 그 아래 숨지 않는다. */
    function fitAll(points) {
      if (!points || !points.length) return;
      backToMap();
      const b = points.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
      const side = (S.sidebarOpen && !tile.isNarrow)
        ? Math.min(220, Math.max(150, body.clientWidth * 0.32)) + 40 : 50;
      map.fitBounds(b, {
        padding: { top: 70, right: 70, bottom: 80, left: side },
        duration: 800,
        maxZoom: 15.5
      });
    }

    function fitCase(group) {
      backToMap();
      const pts = focusItems(group).map(i => i.lngLat);
      if (!pts.length) return;
      const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(b, { padding: 90, duration: 800, maxZoom: 16.5 });
    }

    // ── 표식 누름 ──
    function tap(c) {
      if (c.items.length > 1) { zoomTo(c); return; }
      const it = c.items[0];
      if (it.kind === 'camera') {
        const cam = store.cameras.find(x => x.id === it.id);
        if (cam) {
          fly(lngLat(cam.point), true);
          S.popoverCamera = cam;
          openCase(cam.incidentID, cam.id, false);
          drawCards();
        }
        return;
      }
      if (it.incidentID) openCase(it.incidentID, it.id, !S.openedCase);
      if (!S.openedCase) fly(it.lngLat, true);
    }
    /** 사건 표식을 두 번 누름 — 그 사건의 상황 브리핑을 곁에 띄운다 */
    function openBrief(c) {
      if (c.items.length > 1 || c.items[0].kind !== 'incident') return;
      const inc = store.incidents.find(i => i.id === c.items[0].id);
      if (!inc) return;
      S.popoverCamera = null;
      fly(lngLat(inc.point), true);     // 표식을 화면 가운데로 가져온 뒤 띄운다
      S.briefIncident = inc;
      drawCards();
    }
    function markerMenu(c, ev) {
      if (c.items.length > 1 || c.items[0].kind !== 'unit') return;
      const it = c.items[0];
      const menu = PX.el(`<div class="mp-menu glass"></div>`);
      const add = (text, danger, act) => {
        const b = PX.el(`<button class="mp-menu-item${danger ? ' danger' : ''}">${PX.esc(text)}</button>`);
        b.onclick = () => { menu.remove(); act(); };
        menu.appendChild(b);
      };
      add('지도에서 보기', false, () => fly(it.lngLat, true));
      if (it.incidentID) add('사건에서 삭제', true, () => unassign(it.id));
      else if (S.openedCase) add('이 사건에 배정', false, () => assign(it.id, S.openedCase.reportIDs[0]));
      const box = body.getBoundingClientRect();
      menu.style.left = (ev.clientX - box.left) + 'px';
      menu.style.top = (ev.clientY - box.top) + 'px';
      body.appendChild(menu);
      setTimeout(() => {
        const off = () => { menu.remove(); document.removeEventListener('mousedown', off); };
        document.addEventListener('mousedown', off);
      }, 0);
    }

    // ── 사건 열기 / 배정 ──
    function openCase(incidentID, row, fit) {
      if (!incidentID) return;
      const group = store.caseGroupOf(incidentID);
      if (!group) return;
      backToMap();
      store.select(incidentID);
      if (!S.openedCase || S.openedCase.id !== group.id) {
        S.openedCase = group;
        S.sidebarOpen = true;
        if (fit) fitCase(group);
      }
      S.selectedRowID = row;
      retargetClock();
      drawAll();
    }
    function assign(unitID, incidentID) {
      if (unitID.indexOf('V-') === 0) store.assignVehicle(unitID, incidentID);
      else store.assignOfficer(unitID, incidentID);
      drawAll();
    }
    function unassign(unitID) {
      if (unitID.indexOf('V-') === 0) store.unassignVehicle(unitID);
      else store.unassignOfficer(unitID);
      if (S.selectedRowID === unitID) S.selectedRowID = null;
      drawAll();
    }

    // ── 재생 막대 ──
    function retargetClock() {
      const ids = S.openedCase ? S.openedCase.reportIDs : [store.selectedIncidentID];
      const times = store.incidents.filter(i => ids.indexOf(i.id) >= 0).map(i => i.reportedAt);
      if (!times.length) return;
      times.sort((a, b) => PX.hm(a) - PX.hm(b));
      clock.retarget(times[0]);
    }
    clock.onTick = () => { drawPlay(); drawMarkers(); drawLines(); drawPairLabels(); };

    function drawPlay() {
      const live = clock.isLive && !clock.playing;
      playEl.innerHTML =
        `<button class="mp-play-btn${clock.playing ? ' on' : ''}" data-act="play"
           title="${clock.playing ? '멈춤' : '접수 시각부터 상황을 흘려보냅니다'}">
           ${PX.icon(clock.playing ? 'pause' : 'play')}</button>
         <span class="mp-time${live ? '' : ' accent'} mono">${clock.label}</span>` +
        (tile.isVeryNarrow ? '' :
          `<span class="cap sec">${clock.playing ? '재생 중' : clock.isLive ? '지금' : '되감기'}</span>`) +
        // 손으로 잡아 끌 수 있는 폭이 없으면 슬라이더는 있으나 마나다
        (tile.width > 620
          ? `<input type="range" class="mp-range" min="${clock.span[0]}" max="${clock.span[1]}"
               step="0.05" value="${PX.clamp(clock.now, clock.span[0], clock.span[1])}"
               title="시각을 잡아 끌어 되감습니다">` : '') +
        // 되감아 본 뒤에 돌아올 곳 — 「지금」일 때는 자리를 차지하지 않는다
        (live ? '' : `<button class="mp-now cap" data-act="live" title="지금 상황으로 돌아갑니다">지금</button>`);
    }
    playEl.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'play') {
        // 인력이 꺼져 있으면 재생해도 움직일 것이 없다 — 눌렀을 때 같이 켠다
        if (!clock.playing && !S.showUnits && !S.openedCase) { S.showUnits = true; drawSidebar(); }
        clock.toggle();
        drawAll();
      } else if (b.dataset.act === 'live') {
        clock.goLive();
        drawAll();
      }
    });
    playEl.addEventListener('input', e => {
      if (!e.target.classList.contains('mp-range')) return;
      const v = +e.target.value;
      if (Math.abs(v - clock.now) <= 0.2) return;   // 저절로 되쓰는 값에 재생이 끊기지 않게
      clock.stop();
      clock.now = v;
      clock.onTick();
    });

    // ── 오른쪽 위 조작 ──
    function drawControls() {
      const kindBtn = KINDS.find(k => k.id === S.kind);
      ctlEl.innerHTML =
        (S.showKindMenu
          ? `<div class="mp-kinds glass">` + KINDS.map(k =>
              `<button class="mp-kind${S.kind === k.id ? ' on' : ''}" data-kind="${k.id}">
                 ${PX.icon(k.icon)}<span class="cap">${k.name}</span></button>`).join('') + `</div>`
          : '') +
        (tile.isTiny ? '' :
          `<div class="mp-ctlgroup glass">
             <button class="mp-ctl" data-act="kind" title="지도 종류">${PX.icon(kindBtn.icon)}</button>
             <hr class="hair">
             <button class="mp-ctl" data-act="loc" title="내 위치로 이동">${PX.icon('locate')}</button>
           </div>`);
      ctlEl.style.padding = (tile.isShort ? 6 : 10) + 'px';
    }
    ctlEl.addEventListener('click', e => {
      const k = e.target.closest('[data-kind]');
      if (k) { S.showKindMenu = false; applyKind(k.dataset.kind); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'kind') { S.showKindMenu = !S.showKindMenu; drawControls(); }
      else if (b.dataset.act === 'loc') geo.trigger();
    });

    // ── 사이드바 ──
    function drawSidebar() {
      const narrow = tile.isNarrow;
      const open = S.sidebarOpen && !narrow;
      sideEl.hidden = !open;
      toggleEl.hidden = open;         // 열려 있을 때는 사이드바 첫 줄의 아이콘을 쓴다
      if (!open) return;
      sideEl.style.width = Math.min(220, Math.max(150, body.clientWidth * 0.32)) + 'px';

      let inner =
        `<div class="mp-side-top"><button class="mp-side-fold" data-act="fold" title="사이드바 접기">${PX.icon('sidebar')}</button></div>
         <div class="mp-search">
           ${PX.icon('search', 'sec')}
           <input type="search" placeholder="장소, 주소 검색" value="${PX.esc(S.query)}">
           ${S.query ? `<button class="mp-clear" data-act="clear">${PX.icon('close')}</button>` : ''}
         </div>
         <div class="mp-scroll">`;

      if (S.results.length) {
        inner += S.results.map((r, i) =>
          `<button class="mp-result" data-result="${i}">
             <b class="lab">${PX.esc(r.name)}</b><span class="cap sec">${PX.esc(r.detail)}</span>
           </button>`).join('');
      } else if (S.openedCase) {
        inner += caseDetail(S.openedCase);
      } else {
        inner += `<div class="cap sec mp-secline">지도</div>` + layerRows();
      }
      inner += `</div>`;
      sideEl.innerHTML = inner;

      const input = sideEl.querySelector('input');
      if (input) {
        input.oninput = e => { S.query = e.target.value; };
        input.onkeydown = e => { if (e.key === 'Enter') search(); };
      }
    }

    function layerRows() {
      const row = (title, icon, on, act, count, extra) =>
        `<button class="mp-layer${on ? ' on' : ''}" data-act="${act}">
           ${PX.icon(icon)}<span class="lab">${title}</span>
           <span class="cap sec">${extra != null ? extra : count}</span></button>`;
      let out =
        `<div class="mp-layer-wrap">
           ${row('사건 위치', 'pin', S.showIncidents, 'lay:inc', store.activeIncidents.length)}
           <button class="mp-fold${S.caseListOpen ? ' open' : ''}" data-act="foldcase" title="사건 목록">
             ${PX.icon('chev-r')}</button>
         </div>`;
      if (S.caseListOpen) {
        out += `<div class="mp-cases">` + store.caseGroups.map(g => {
          const head = store.incidents.find(i => i.id === g.reportIDs[0]);
          return `<button class="mp-case" data-case="${PX.esc(g.id)}">
                    ${PX.dot(head ? head.priority : '일반', 8)}
                    <span class="mp-case-t">
                      <b class="lab">${PX.esc(g.title)}</b>
                      ${g.reportIDs.length > 1 ? `<span class="cap sec">신고 ${g.reportIDs.length}건 묶음</span>` : ''}
                    </span>
                    ${PX.icon('chev-r', 'sec')}
                  </button>`;
        }).join('') + `</div>`;
      }
      out += row('인력·차량', 'officer', S.showUnits, 'lay:units', store.officers.length + store.vehicles.length);
      out += `<button class="mp-layer${S.arMode !== 'off' ? ' on' : ''}" data-act="ar">
                ${PX.icon('glasses')}<span class="lab">AR글래스 캠</span>
                <span class="cap sec">${S.arMode === 'off' ? '' : (S.arMode === 'full' ? '전체' : '보는 중')}</span>
              </button>`;
      out += row('CCTV', 'cctv', S.showCameras, 'lay:cams', store.cameras.length);
      out += `<div class="mp-plain">${PX.icon('send')}<span class="lab">전송·지시</span></div>
              <div class="mp-plain">${PX.icon('history')}<span class="lab">히스토리</span></div>`;
      return out;
    }

    function caseDetail(group) {
      const reports = group.reportIDs.map(id => store.incidents.find(i => i.id === id)).filter(Boolean);
      const officers = [].concat.apply([], group.reportIDs.map(r => store.officersOf(r)));
      const vehicles = [].concat.apply([], group.reportIDs.map(r => store.vehiclesOf(r)));
      const cams = [].concat.apply([], group.reportIDs.map(r => store.camerasOf(r)));
      const head = reports[0];

      const row = (id, color, icon, title, sub, trailing, square) =>
        `<button class="mp-row${S.selectedRowID === id ? ' on' : ''}" data-row="${PX.esc(id)}">
           <span class="mp-row-ic${square ? ' sq' : ''}" style="background:${color}">${PX.icon(icon)}</span>
           <span class="mp-row-t"><b class="lab">${PX.esc(title)}</b><span class="cap sec">${PX.esc(sub)}</span></span>
           ${trailing ? `<span class="cap sec">${PX.esc(trailing)}</span>` : ''}
         </button>`;
      const section = (title, count, rows, addLabel, addKind) =>
        (count > 0 || addLabel)
          ? `<div class="mp-sec"><hr class="hair">
               <div class="mp-sec-h"><span class="cap sec">${title}</span><span class="cap sec">${count}</span></div>
               ${rows}
               ${addLabel ? `<button class="mp-add" data-add="${addKind}">${PX.icon('plus')}<span class="cap">${addLabel}</span></button>` : ''}
             </div>`
          : '';

      return `<button class="mp-back" data-act="back">${PX.icon('chev-l')}<span class="lab">사건 목록</span></button>
        <div class="mp-case-head">${PX.dot(head ? head.priority : '일반', 8)}<b>${PX.esc(group.title)}</b></div>
        <div class="cap sec mp-case-place">${PX.esc(head ? head.place : '')}</div>
        ${group.note ? `<div class="mp-case-note">${PX.icon('link', 'sec')}<span class="cap sec">${PX.esc(group.note)}</span></div>` : ''}
        ${section(reports.length > 1 ? '묶인 신고' : '신고', reports.length,
          reports.map(r => row(r.id, COLOR.incident, 'exclaim', r.type,
            r.id + ' · ' + r.reportedAt + ' 접수 · ' + r.status, null)).join(''))}
        ${section('배정 인력', officers.length,
          officers.map(o => row(o.id, COLOR.unit, 'officer', o.call + ' ' + o.name, o.task,
            o.state === '이동 중' ? '이동' : '현장')).join(''), '인력 추가', 'officer')}
        ${section('차량', vehicles.length,
          vehicles.map(v => row(v.id, COLOR.unit, 'car', v.label, '탑승 ' + v.crew, '현장')).join(''), '차량 추가', 'vehicle')}
        ${section('CCTV', cams.length,
          cams.map(c => row(c.id, COLOR.camera, 'cctv', c.name, c.id + ' · 교통 ' + c.traffic, null, true)).join(''))}`;
    }

    sideEl.addEventListener('click', e => {
      const t = e.target;
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'fold') { S.sidebarOpen = false; drawSidebar(); return; }
        if (a === 'clear') { S.query = ''; S.results = []; S.searchPin = null; drawSidebar(); drawMarkers(); return; }
        if (a === 'foldcase') { S.caseListOpen = !S.caseListOpen; drawSidebar(); return; }
        if (a === 'back') { S.openedCase = null; S.selectedRowID = null; retargetClock(); drawAll(); return; }
        if (a === 'ar') { S.arMode = S.arMode === 'off' ? 'pip' : 'off'; drawAR(); drawSidebar(); return; }
        if (a.indexOf('lay:') === 0) {
          const k = a.slice(4);
          if (k === 'inc') {
            S.showIncidents = !S.showIncidents;
            // 켤 때는 사건 표식이 **하나도 잘리지 않게** 지도를 맞춰 준다
            if (S.showIncidents) fitAll(store.incidents.filter(i => i.status !== '종료').map(i => lngLat(i.point)));
          }
          if (k === 'units') S.showUnits = !S.showUnits;
          if (k === 'cams') S.showCameras = !S.showCameras;
          drawSidebar(); drawMarkers();
          return;
        }
      }
      const g = t.closest('[data-case]');
      if (g) {
        const group = store.caseGroups.find(x => x.id === g.dataset.case);
        if (group) {
          S.openedCase = group;
          const head = store.incidents.find(i => i.id === group.reportIDs[0]);
          if (head) store.select(head.id);
          S.selectedRowID = null;
          retargetClock();
          fitCase(group);
          drawAll();
        }
        return;
      }
      const r = t.closest('[data-row]');
      if (r) {
        const id = r.dataset.row;
        S.selectedRowID = id;
        const inc = store.incidents.find(x => x.id === id);
        const o = store.officers.find(x => x.id === id);
        const v = store.vehicles.find(x => x.id === id);
        const c = store.cameras.find(x => x.id === id);
        if (inc) fly(lngLat(inc.point), true);
        else if (o) fly(lngLat(o.point), true);
        else if (v) fly(lngLat(v.point), true);
        else if (c) { fly(lngLat(c.point), true); S.popoverCamera = c; drawCards(); }
        drawSidebar();
        return;
      }
      const add = t.closest('[data-add]');
      if (add) { addMenu(add.dataset.add, add); return; }
      const res = t.closest('[data-result]');
      if (res) {
        const hit = S.results[+res.dataset.result];
        if (hit) {
          S.searchPin = hit.lngLat;
          fly(hit.lngLat, true);
          S.results = [];
          drawSidebar();
          drawMarkers();
        }
      }
    });

    function addMenu(kind, anchor) {
      const pool = kind === 'officer'
        ? store.officers.filter(o => !o.incidentID)
        : store.vehicles.filter(v => !v.incidentID);
      const menu = PX.el(`<div class="mp-menu glass"></div>`);
      if (!pool.length) {
        menu.appendChild(PX.el(`<div class="mp-menu-item sec">${kind === 'officer' ? '대기 중인 인력이 없습니다' : '대기 중인 차량이 없습니다'}</div>`));
      } else {
        pool.forEach(u => {
          const label = kind === 'officer' ? (u.call + ' ' + u.name + ' · ' + u.team) : (u.label + ' · 탑승 ' + u.crew);
          const b = PX.el(`<button class="mp-menu-item">${PX.esc(label)}</button>`);
          b.onclick = () => {
            menu.remove();
            if (S.openedCase) assign(u.id, S.openedCase.reportIDs[0]);
          };
          menu.appendChild(b);
        });
      }
      const box = body.getBoundingClientRect(), a = anchor.getBoundingClientRect();
      menu.style.left = (a.left - box.left) + 'px';
      menu.style.top = (a.bottom - box.top + 4) + 'px';
      body.appendChild(menu);
      setTimeout(() => {
        const off = () => { menu.remove(); document.removeEventListener('mousedown', off); };
        document.addEventListener('mousedown', off);
      }, 0);
    }

    /** 장소 검색 — 애플의 MKLocalSearch 대신 공개 지명 검색을 쓴다 */
    function search() {
      const text = S.query.trim();
      if (!text) { S.results = []; drawSidebar(); return; }
      const b = map.getBounds();
      const url = 'https://nominatim.openstreetmap.org/search?format=json&accept-language=ko&limit=8&q='
        + encodeURIComponent(text)
        + '&viewbox=' + [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(',');
      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(r => r.json())
        .then(list => {
          S.results = list.map(x => ({
            name: (x.name || x.display_name.split(',')[0]),
            detail: x.display_name,
            lngLat: [+x.lon, +x.lat]
          }));
          drawSidebar();
        })
        .catch(() => { S.results = []; drawSidebar(); });
    }

    // ── 지도 위에 얹는 카드 (CCTV · 사건 브리핑) ──
    /* 표식 자리를 화면 좌표로 바꿔 그 곁에 카드를 세운다.
       아래에 자리가 없으면 위로, 옆으로도 모자라면 안쪽으로 밀어 잘리지 않게 한다. */
    function cardOrigin(pt, card) {
      const gap = 18, edge = 8;
      const W = body.clientWidth, H = body.clientHeight;
      // 사이드바가 펼쳐져 있으면 그 뒤로 숨지 않게 왼쪽 한계를 옮긴다
      const left = (S.sidebarOpen && !tile.isNarrow)
        ? Math.min(220, Math.max(150, W * 0.32)) + 24 : edge;
      const below = pt.y + gap, above = pt.y - card.h - gap;
      const y = (below + card.h <= H - edge || above < edge) ? below : above;
      return {
        x: Math.min(Math.max(pt.x - card.w / 2, left), Math.max(left, W - card.w - edge)),
        y: Math.min(Math.max(y, edge), Math.max(edge, H - card.h - edge))
      };
    }

    function drawCards() {
      if (!S.popoverCamera && !S.briefIncident) { cardEl.innerHTML = ''; return; }
      if (!cardEl.dataset.key || cardEl.dataset.key !== cardKey()) {
        cardEl.dataset.key = cardKey();
        cardEl.innerHTML =
          (S.popoverCamera ? cameraCard(S.popoverCamera) : '') +
          (S.briefIncident ? briefCard(S.briefIncident) : '');
      }
      const cam = cardEl.querySelector('.mp-cam');
      if (cam && S.popoverCamera) {
        const pt = map.project(lngLat(S.popoverCamera.point));
        const o = cardOrigin(pt, { w: cam.offsetWidth, h: cam.offsetHeight });
        cam.style.left = o.x + 'px'; cam.style.top = o.y + 'px';
      }
      const brief = cardEl.querySelector('.mp-brief');
      if (brief && S.briefIncident) {
        const pt = map.project(lngLat(S.briefIncident.point));
        const o = cardOrigin(pt, { w: brief.offsetWidth, h: brief.offsetHeight });
        brief.style.left = o.x + 'px'; brief.style.top = o.y + 'px';
      }
    }
    const cardKey = () => (S.popoverCamera ? S.popoverCamera.id : '-') + '|' + (S.briefIncident ? S.briefIncident.id : '-');

    function cameraCard(c) {
      const tone = c.traffic === '통제' ? 'var(--c-urgent)' : c.traffic === '정체' ? 'var(--c-caution)' : 'var(--ink-2)';
      return `<div class="mp-card mp-cam glass">
        <div class="mp-card-h">
          <span class="mp-card-t"><b class="lab">${PX.esc(c.name)}</b>
            <span class="cap sec">${PX.esc(c.id)} · 실시간 (가상)</span></span>
          <button class="mp-card-x" data-close="cam">${PX.icon('close')}</button>
        </div>
        <div class="mp-feed">
          <img src="cctv_street.jpg" alt="">
          <span class="mp-feed-top"><span class="cap">${PX.esc(c.id)}</span>
            <span class="mp-rec cap"><i></i>REC</span></span>
          <span class="mp-feed-bot"><span class="cap">가상 CCTV 영상 (실영상 아님)</span>
            <span class="cap">교통 ${PX.esc(c.traffic)}</span></span>
        </div>
        <div class="mp-traffic"><span class="dot" style="background:${tone};width:7px;height:7px"></span>
          <span class="cap">교통 ${PX.esc(c.traffic)}</span></div>
      </div>`;
    }

    /* 사건 표식을 두 번 눌렀을 때 곁에 뜨는 상황 브리핑.
       전체 상황 창의 브리핑과 같은 위계다 — 이름 16 / 요약 14 / 확인용 12, 위험은 기호로. */
    function briefCard(inc) {
      const n = store.officersOf(inc.id).length;
      return `<div class="mp-card mp-brief glass">
        <div class="mp-brief-h">
          <b class="mp-brief-name">${PX.esc(inc.type)}</b>
          <span class="mp-brief-prio">${PX.dot(inc.priority, 7)}<span class="cap sec">${PX.esc(inc.priority)}</span></span>
          <span class="cap sec mono mp-brief-id">${PX.esc(inc.id)}</span>
          <button class="mp-card-x" data-close="brief">${PX.icon('close')}</button>
        </div>
        <div class="mp-brief-sum">${PX.esc(inc.summary)}</div>
        <hr class="hair">
        <div class="mp-brief-meta cap sec">
          <div>${PX.esc(inc.team)} · ${PX.esc(inc.place)}</div>
          <div>${PX.esc(inc.status)} · 투입 ${n}명 · ${PX.esc(inc.reportedAt)} 접수</div>
        </div>
        ${inc.hazards && inc.hazards.length ? `<hr class="hair mp-brief-line">
          <div class="mp-brief-hz">
            <span class="mp-hz-ic" title="위험 요소">${PX.icon('warning')}</span>
            <span class="mp-hz-list">${inc.hazards.map(h => `<span class="cap">${PX.esc(h)}</span>`).join('')}</span>
          </div>` : ''}
      </div>`;
    }
    cardEl.addEventListener('click', e => {
      const b = e.target.closest('[data-close]');
      if (!b) return;
      if (b.dataset.close === 'cam') S.popoverCamera = null; else S.briefIncident = null;
      cardEl.dataset.key = '';
      drawCards();
    });

    // ── AR글래스 캠 ──
    function drawAR() {
      if (S.arMode === 'off') { arEl.innerHTML = ''; arEl.hidden = true; return; }
      arEl.hidden = false;
      if (S.arMode === 'full') {
        arEl.className = 'mp-ar full';
        arEl.innerHTML =
          `<div class="mp-arfeed">${arFeed()}</div>
           <div class="mp-arbar glass">
             ${PX.icon('glasses')}<span class="cap"><b>AR글래스 캠</b></span>
             <button class="mp-pip-btn" data-ar="pip" title="작은 창으로">${PX.icon('restore')}</button>
             <button class="mp-pip-btn" data-ar="off" title="닫고 지도로">${PX.icon('close')}</button>
           </div>`;
      } else {
        arEl.className = 'mp-ar pip';
        arEl.style.setProperty('--pip-w', (tile.isNarrow ? 280 : 360) + 'px');
        arEl.innerHTML =
          `<div class="mp-pip glass">
             <div class="mp-pip-h">${PX.icon('glasses')}<span class="cap"><b>AR글래스 캠</b></span>
               <span class="spacer"></span>
               <button class="mp-pip-btn" data-ar="full" title="작전 지도 전체창으로">${PX.icon('expand')}</button>
               <button class="mp-pip-btn" data-ar="off" title="닫기">${PX.icon('close')}</button>
             </div>
             <div class="mp-arfeed" style="height:${tile.isShort ? 150 : 200}px">${arFeed()}</div>
           </div>`;
      }
    }
    /* 현장 AR 영상 (ARScreen.swift) — 가상 화면이다. 실영상이 아니다.
       영상 안 왼쪽 위 드롭다운으로 시점을 바꾸고, 배터리·좌표·교신 시각을 얹는다. */
    let arPicked = null;
    const arLinked = () => store.officers.filter(o => o.ar !== '미연결');
    function arOfficer() {
      const linked = arLinked();
      return linked.find(o => o.id === arPicked)
        || linked.find(o => o.incidentID === store.selectedIncidentID)
        || linked[0] || null;
    }
    function batteryIcon(v) { return 'battery'; }   // 스프라이트에 단계별 배터리가 없어 한 가지를 쓴다

    function arFeed() {
      const o = arOfficer();
      if (!o) {
        return `<div class="mp-ar-none cap sec">현재 사건에 AR 글래스 연결 인원이 없습니다.</div>`;
      }
      const linked = arLinked();
      const cur = linked.filter(x => x.incidentID === store.selectedIncidentID);
      const others = linked.filter(x => x.incidentID !== store.selectedIncidentID);
      const opt = x => `<button class="mp-ar-opt${x.id === o.id ? ' on' : ''}" data-arpick="${PX.esc(x.id)}">${PX.esc(x.call + ' ' + x.name)}</button>`;
      return `<div class="mp-scene">
          <div class="mp-scene-bg"></div>
          <span class="mp-scene-cross">${PX.icon('plus')}</span>
          <span class="mp-scene-rec cap">
            <i style="background:var(--c-urgent)"></i>
            <b style="color:${o.ar === '연결' ? 'var(--c-urgent)' : '#fff'}">${o.ar === '연결' ? 'REC' : '대기'}</b>
          </span>
          <span class="mp-scene-foot cap">
            <span>X ${Math.round(o.point.x)} · Y ${Math.round(o.point.y)} (가상 좌표)</span>
            <span class="mono">${PX.esc(o.commAt)}</span>
          </span>
          ${o.ar === '두절' ? `<div class="mp-scene-lost">
              ${PX.icon('warning')}
              <b class="lab">영상 신호 없음</b>
              <span class="cap sec">통신 재연결 시도 중 (가상)</span>
            </div>` : ''}
        </div>
        <div class="mp-ar-top">
          <div class="mp-ar-pick" data-armenu="1">
            <span>${PX.esc(o.call + ' ' + o.name)}</span>${PX.icon('chev-ud')}
            <div class="mp-ar-menu glass" hidden>
              ${cur.length ? `<div class="mp-ar-sec cap sec">현재 사건 ${PX.esc(store.selectedIncidentID)}</div>` + cur.map(opt).join('') : ''}
              ${others.length ? `<div class="mp-ar-sec cap sec">다른 사건</div>` + others.map(opt).join('') : ''}
            </div>
          </div>
          <span class="mp-ar-batt cap">${PX.icon(batteryIcon(o.battery))}<span class="mono">${o.battery}%</span></span>
        </div>`;
    }
    arEl.addEventListener('click', e => {
      const pick = e.target.closest('[data-arpick]');
      if (pick) { arPicked = pick.dataset.arpick; drawAR(); return; }
      const menu = e.target.closest('[data-armenu]');
      if (menu) {
        const m = menu.querySelector('.mp-ar-menu');
        m.hidden = !m.hidden;
        return;
      }
      const b = e.target.closest('[data-ar]');
      if (!b) return;
      S.arMode = b.dataset.ar;
      drawAR();
      drawSidebar();
    });

    toggleEl.onclick = () => { S.sidebarOpen = true; drawSidebar(); };

    // ── 전체 다시 그리기 ──
    function drawAll() {
      drawSidebar();
      drawControls();
      drawPlay();
      drawAR();
      drawMarkers();
      drawLines();
      drawPairLabels();
      drawCards();
    }

    // 다른 화면이 사건을 바꾸면 따라간다
    const off = store.subscribe(what => {
      if (what === 'incident') {
        const g = store.caseGroupOf(store.selectedIncidentID);
        if (g && (!S.openedCase || S.openedCase.id !== g.id)) { S.openedCase = g; S.sidebarOpen = true; fitCase(g); }
        retargetClock();
        drawAll();
      } else if (what === 'units') {
        drawAll();
      } else if (what === 'theme') {
        swapStyle(store.darkMode);
      }
    });

    retargetClock();

    return {
      resize(t) {
        tile = t;
        map.resize();
        drawAll();
      },
      destroy() {
        off();
        clock.stop();
        map.remove();
      }
    };
  }

  PX.screens.map = { mount: mount };
})(window.PX);
