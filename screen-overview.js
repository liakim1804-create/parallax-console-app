/* 전체 상황: 상황 요약 · 사건 브리핑 · 사건 목록
   OverviewScreen.swift 를 옮긴 것.
   SwiftUI 는 @State(query) 나 @EnvironmentObject 가 바뀌면 body 를 다시 만들지만
   여기서는 그런 것이 없어, 바뀔 수 있는 세 덩어리를 paint() 로 다시 그린다.
   창 크기(tile)가 바뀌면 덜어 내는 내용 자체가 달라지므로 build() 로 통째로 다시 세운다. */

(function (PX) {
  'use strict';

  var esc = PX.esc;

  /** 점은 자리를 늘 차지한다 — 점이 없는 줄과 글 시작점을 맞추기 위해서다 */
  function dotGutter(prio) {
    return '<span class="ov-gutter">' + (prio ? PX.dot(prio, 7) : '') + '</span>';
  }

  function metricHTML(title, value, prio) {
    return '<div class="ov-metric">' + dotGutter(prio) +
      '<span class="ov-m-t cap sec">' + esc(title) + '</span>' +
      /* 값을 칸 오른쪽에 붙인다 — 칸 폭이 같으므로 숫자가 한 줄로 선다 */
      '<span class="ov-m-v mono">' + esc(value) + '</span>' +
      '</div>';
  }

  PX.screens.overview = {
    mount: function (bodyEl, ctx) {
      var store = ctx.store;
      var tile = ctx.tile || PX.tile(400, 300);
      var query = '';

      var root = PX.el('<div class="ov-root"><div class="ov-pad"></div></div>');
      bodyEl.appendChild(root);
      var pad = root.firstElementChild;

      var elSummary, elBriefing, elCount, elSearch, elRows;
      var visibleRows = [];

      // ── 검색에 걸린 사건들 ───────────────────────────────
      function rowsFor() {
        var q = query.trim();
        if (!q) return store.incidents.slice();
        return store.incidents.filter(function (i) {
          return (i.id + ' ' + i.type + ' ' + i.place + ' ' + i.team).indexOf(q) >= 0;
        });
      }

      // ── 틀 세우기 (크기 규칙이 바뀔 때마다) ────────────────
      function build() {
        var keepScroll = root.scrollTop;
        var focused = elSearch && document.activeElement === elSearch;
        var caret = focused ? elSearch.selectionStart : 0;

        // 크기에 따라 달라지는 값은 CSS 변수로 한 번만 내려 준다
        root.style.setProperty('--ov-inset', tile.inset + 'px');
        root.style.setProperty('--ov-blockgap', tile.blockGap + 'px');
        // cardInset: 좁으면 16, 아니면 20
        root.style.setProperty('--ov-cardinset', (tile.isNarrow ? 16 : 20) + 'px');
        root.style.setProperty('--ov-mgap', (tile.isNarrow ? 10 : 16) + 'px');
        root.style.setProperty('--ov-secgap', (tile.isShort ? 10 : 16) + 'px');
        root.style.setProperty('--ov-rowpad', (tile.isShort ? 7 : 10) + 'px');
        root.style.setProperty('--ov-nametop-pb', (tile.isVeryNarrow ? 0 : 6) + 'px');
        root.classList.toggle('is-narrow', tile.isNarrow);
        root.classList.toggle('is-very-narrow', tile.isVeryNarrow);
        root.classList.toggle('is-tiny', tile.isTiny);
        root.classList.toggle('is-short', tile.isShort);
        root.classList.toggle('is-very-short', tile.isVeryShort);

        pad.innerHTML =
          '<div class="ov-summary"></div>' +
          '<hr class="hair ov-blockdiv">' +
          '<div class="ov-briefing"></div>' +
          '<hr class="hair ov-blockdiv">' +
          '<div class="ov-list">' +
            '<div class="ov-list-head">' +
              '<span class="cap sec">사건 목록</span>' +
              '<span class="cap sec ov-count"></span>' +
            '</div>' +
            // 낮으면 검색칸을 접는다 — 목록 몇 줄이라도 보이는 편이 낫다
            (tile.isVeryShort ? '' :
              '<div class="ov-search">' + PX.icon('search') +
              '<input type="search" class="ov-search-in" placeholder="사건 검색" aria-label="사건 검색">' +
              '</div>') +
            '<div class="ov-rows"></div>' +
          '</div>';

        elSummary = pad.querySelector('.ov-summary');
        elBriefing = pad.querySelector('.ov-briefing');
        elCount = pad.querySelector('.ov-count');
        elRows = pad.querySelector('.ov-rows');
        elSearch = pad.querySelector('.ov-search-in');

        if (elSearch) {
          elSearch.value = query;
          elSearch.addEventListener('input', function () {
            query = elSearch.value;
            paintList();
          });
          if (focused) {
            elSearch.focus();
            try { elSearch.setSelectionRange(caret, caret); } catch (e) { /* 무시 */ }
          }
        }

        paint();
        root.scrollTop = keepScroll;
      }

      // ── 상황 요약 줄 ─────────────────────────────────────
      function paintSummary() {
        var active = store.activeIncidents;
        var html =
          metricHTML('진행 중 사건', String(active.length)) +
          metricHTML('긴급 사건',
            String(active.filter(function (i) { return i.priority === '긴급'; }).length), '긴급');
        // 아주 좁으면 지표를 둘만 남긴다 — 넷이 두 줄로 접히면 오히려 읽기 어렵다
        if (!tile.isTiny) {
          html += metricHTML('투입 인원',
            String(store.officers.filter(function (o) { return !!o.incidentID; }).length));
          html += metricHTML('통신 이상',
            String(store.officers.filter(function (o) {
              return o.ar === '불안정' || o.ar === '두절';
            }).length), '주의');
        }
        elSummary.innerHTML = html;
      }

      // ── 사건 브리핑 ──────────────────────────────────────
      function paintBriefing() {
        var inc = store.selectedIncident;
        if (!inc) { elBriefing.innerHTML = ''; return; }

        var hazards = inc.hazards || [];
        var showHaz = hazards.length > 0 && !tile.isVeryShort;
        // 위험 요소가 없거나 아주 낮으면 ③ 아래 여백을 카드 여백과 같게 둔다
        var whoBottom = showHaz ? '11px' : 'var(--ov-cardinset)';

        var html =
          // 머리글은 배경으로 물러난다 — 굵은 글씨가 많으면 어디를 볼지 알 수 없다
          '<div class="ov-sec-title cap sec">사건 브리핑</div>' +
          // 바깥은 한 덩어리, 안은 구역으로 나눈다.
          // 카드를 넷으로 쪼개면 화면이 시끄럽고, 선이 없으면 정보가 흘러내린다 —
          // 애플의 그룹 목록처럼 한 판 안에서 얇은 선으로 가른다.
          '<div class="ov-card">' +
            // ① 무슨 사건인가 — 이름은 왼쪽 그리드에서 시작하고,
            //    긴급도와 사건 번호는 읽고 나서 확인하는 값이라 오른쪽 끝에 함께 모은다
            '<div class="ov-card-head">' +
              '<span class="ov-inc-type">' + esc(inc.type) + '</span>' +
              '<span class="ov-head-right">' +
                '<span class="ov-prio cap sec">' + PX.dot(inc.priority, 7) + esc(inc.priority) + '</span>' +
                '<span class="ov-inc-id cap sec mono">' + esc(inc.id) + '</span>' +
              '</span>' +
            '</div>' +
            // ② 지금 무슨 일인가 — 읽어야 할 한 문장
            '<div class="ov-card-sum">' + esc(inc.summary) + '</div>' +
            '<hr class="hair">' +
            // ③ 누가 맡았고 어디인가 — 확인용
            '<div class="ov-card-who cap sec" style="padding-bottom:' + whoBottom + '">' +
              esc(inc.team + ' · ' + inc.place) +
            '</div>' +
            // ④ 조심할 것 — 경고 아이콘 거터로 한눈에 갈린다
            (showHaz
              ? '<hr class="hair">' +
                '<div class="ov-card-haz">' +
                  '<span class="ov-haz-ic" title="위험 요소" aria-label="위험 요소">' +
                    PX.icon('warning') + '</span>' +
                  '<div class="ov-haz-list">' +
                    hazards.map(function (h) { return '<div>' + esc(h) + '</div>'; }).join('') +
                  '</div>' +
                '</div>'
              : '') +
          '</div>';

        elBriefing.innerHTML = html;
      }

      // ── 사건 목록 ────────────────────────────────────────
      function rowHTML(inc, selected) {
        var prio = inc.priority;
        var parts = '';

        if (!tile.isNarrow) {
          parts += '<span class="ov-row-id cap sec">' + esc(inc.id) + '</span>';
        }

        var main =
          '<div class="ov-row-top">' +
            // 일반 사건의 회색 점은 알려 주는 것이 없다 — 거터만 비워 두고 정렬은 지킨다
            dotGutter(prio === '일반' ? null : prio) +
            '<span class="ov-row-type">' + esc(inc.type) + '</span>' +
            // 좁으면 둘째 줄을 통째로 빼므로, ID 는 이름 줄 끝에 남긴다
            (tile.isNarrow ? '<span class="ov-row-idr cap sec">' + esc(inc.id) + '</span>' : '') +
          '</div>';

        // 좁은 폭에서는 이 줄이 없어도 목록을 쓸 수 있다 — 회색 문장이 절반을 먹지 않게 뺀다
        if (!tile.isNarrow) {
          main += '<div class="ov-row-sub ov-row-where cap sec">' +
            esc(inc.place + ' · 발생 ' + inc.reportedAt) + '</div>';
        }
        if (!tile.isVeryNarrow) {
          main += '<div class="ov-row-sub cap sec">' +
            esc(inc.status + ' · 투입 ' + store.officersOf(inc.id).length + '명 · ' + inc.team) +
            '</div>';
        }

        return '<div class="ov-row' + (selected ? ' sel' : '') + '" data-id="' + esc(inc.id) + '">' +
          parts + '<div class="ov-row-main">' + main + '</div></div>';
      }

      function paintList() {
        visibleRows = rowsFor();
        var total = store.incidents.length;
        elCount.textContent = visibleRows.length === total
          ? total + '건'
          : visibleRows.length + ' / ' + total + '건';

        var sel = store.selectedIncidentID;
        var html = '';
        visibleRows.forEach(function (inc, i) {
          html += rowHTML(inc, inc.id === sel);
          // 선택된 행에 닿는 선은 그리지 않는다 — 둥근 하이라이트를 가로질러 잘린 것처럼 보인다
          if (i < visibleRows.length - 1) {
            var touches = inc.id === sel || visibleRows[i + 1].id === sel;
            if (!touches) html += '<hr class="hair">';
          }
        });
        elRows.innerHTML = html;
      }

      function paint() {
        paintSummary();
        paintBriefing();
        paintList();
      }

      // 행을 누르면 사건을 바꾼다 (다른 화면도 함께 따라온다).
      // pad 는 다시 세워도 그대로 있으므로 위임으로 한 번만 단다.
      pad.addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('.ov-row') : null;
        if (!row || !pad.contains(row)) return;
        store.select(row.dataset.id);
      });

      build();

      // 다른 화면이 사건·인력을 바꾸면 여기도 따라 바뀐다 (@Published 자리)
      var off = store.subscribe(function () { paint(); });

      return {
        resize: function (t) {
          var was = tile;
          tile = t;
          // 크기 규칙이 하나라도 달라졌을 때만 다시 세운다
          var changed =
            was.inset !== t.inset || was.blockGap !== t.blockGap ||
            was.isNarrow !== t.isNarrow || was.isVeryNarrow !== t.isVeryNarrow ||
            was.isTiny !== t.isTiny || was.isShort !== t.isShort ||
            was.isVeryShort !== t.isVeryShort;
          if (changed) build();
        },
        destroy: function () {
          off();
          bodyEl.innerHTML = '';
        }
      };
    }
  };
})(window.PX);
