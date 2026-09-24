/* 기록·회의록 (HandoverScreen.swift) + 사건 처리 단계 (ProgressScreen.swift)
   일반 <script> 로 불린다 (ES module 아님).

   SwiftUI 는 @EnvironmentObject 가 바뀌면 body 를 저절로 다시 그리지만 여기서는 그런 것이 없어,
   store.subscribe() 로 바뀜을 듣고 그때마다 다시 그린다.
   다시 그릴 때 스크롤 위치가 맨 위로 튀지 않도록 scrollTop 을 가지고 있다가 되돌려 준다. */
(function (PX) {
  'use strict';

  var store = PX.store;
  var esc = PX.esc;

  /** 사건 하나의 조치 기록 줄 — Swift: officers(of:).map { "\(call) · \(task)" } */
  function actionsOf(incID) {
    return store.officersOf(incID).map(function (o) { return o.call + ' · ' + o.task; });
  }

  // ══════════════════════════════════════════════════════════════
  //  기록·회의록 — 조치 기록과 회의록 요약
  // ══════════════════════════════════════════════════════════════
  PX.screens.handover = {
    mount: function (body, ctx) {
      var tile = ctx.tile;
      var root = PX.el('<div class="ho-root"><div class="ho-scroll"><div class="ho-pad"></div></div></div>');
      body.appendChild(root);
      var scroll = root.querySelector('.ho-scroll');
      var pad = root.querySelector('.ho-pad');

      // 체크 단추가 누른 줄을 다시 찾을 수 있도록, 마지막으로 그린 목록을 들고 있는다
      var actions = [];

      function render() {
        var inc = store.selectedIncident;
        var stages = PX.data.stages;
        var at = store.stageOf(inc.id);
        var units = store.officersOf(inc.id);
        actions = actionsOf(inc.id);

        var keep = scroll.scrollTop;

        // 창 크기에 따라 달라지는 값만 인라인으로 준다 (TileMetrics.inset / blockGap)
        pad.style.padding = tile.inset + 'px';
        pad.style.gap = tile.blockGap + 'px';

        var h = [];

        // ── 머리 (사건 이름과 담당) ──
        h.push('<div class="ho-head">');
        h.push('<div class="ho-title">' + PX.dot(inc.priority, 9) +
               '<span class="ho-id">' + esc(inc.id + ' ' + inc.type) + '</span></div>');
        h.push('<div class="cap sec">' + esc('담당 ' + inc.team + ' · ' + inc.place) + '</div>');
        h.push('</div>');

        h.push('<hr class="hair">');

        // ── 조치 기록 ──
        h.push('<div class="ho-sec"><div class="ho-h2">조치 기록</div>');
        if (actions.length) {
          actions.forEach(function (a, i) {
            var done = store.handoverDone.has(a);
            h.push('<div class="ho-row">' +
              '<button type="button" class="ho-chk' + (done ? ' on' : '') + '" data-i="' + i + '"' +
              ' aria-pressed="' + (done ? 'true' : 'false') + '"' +
              ' title="' + (done ? '완료 취소' : '완료로 표시') + '">' +
              (done ? PX.icon('check') : '') + '</button>' +
              '<span class="ho-act' + (done ? ' done' : '') + '">' + esc(a) + '</span>' +
              '</div>');
          });
        } else {
          h.push('<div class="cap sec">등록된 조치가 없습니다.</div>');
        }
        h.push('</div>');

        h.push('<hr class="hair">');

        // ── 회의록 요약 ──
        h.push('<div class="ho-sec"><div class="ho-h2">회의록 요약</div>');
        h.push('<div class="ho-sum">' + esc(inc.summary) + '</div>');
        if (inc.hazards && inc.hazards.length) {
          // 「위험 요소」 뒤의 두 칸은 Swift 원문 그대로다. HTML 은 빈칸을 하나로 합치므로 &#160; 으로 둔다
          h.push('<div class="ho-haz">' + PX.dot('주의', 7) +
                 '<span class="cap sec">위험 요소&#160;&#160;' + esc(inc.hazards.join(' · ')) + '</span></div>');
        }
        h.push('<div class="cap sec">' +
               esc('처리 단계 ' + stages[at] + ' ' + (at + 1) + '/' + stages.length +
                   ' · 투입 ' + units.length + '명') + '</div>');
        h.push('</div>');

        pad.innerHTML = h.join('');
        scroll.scrollTop = keep;
      }

      // 체크 단추 — 줄 글자 자체를 열쇠로 쓴다 (Swift 의 handoverDone 도 문자열 Set 이다)
      scroll.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.ho-chk') : null;
        if (!b) return;
        var a = actions[+b.dataset.i];
        if (a == null) return;
        if (store.handoverDone.has(a)) store.handoverDone.delete(a);
        else store.handoverDone.add(a);
        store.emit('handover');   // 직접 바꿨으니 직접 알린다
      });

      var off = store.subscribe(function (what) {
        // 사건이 바뀌면(다른 화면에서 골라도) 그 사건 기준으로 다시 그린다.
        // 인력 배정(units)·단계(stage) 도 이 화면의 글에 그대로 나오므로 함께 듣는다
        if (what === 'incident' || what === 'handover' || what === 'units' || what === 'stage') render();
      });

      render();

      return {
        resize: function (t) { tile = t; render(); },
        destroy: function () { off(); }
      };
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  사건 처리 상태 — 신고 접수부터 종료까지 8단계
  //  (아직 탭에는 없지만 Swift 쪽 코드가 남아 있어 함께 옮겨 둔다)
  // ══════════════════════════════════════════════════════════════
  PX.screens.progress = {
    mount: function (body, ctx) {
      var tile = ctx.tile;
      var root = PX.el(
        '<div class="pg-root">' +
          '<div class="pg-bar"></div>' +
          '<hr class="hair">' +
          '<div class="pg-scroll"><div class="pg-list"></div></div>' +
          '<hr class="hair">' +
          '<div class="pg-foot"></div>' +
        '</div>');
      body.appendChild(root);
      var bar = root.querySelector('.pg-bar');
      var scroll = root.querySelector('.pg-scroll');
      var list = root.querySelector('.pg-list');
      var foot = root.querySelector('.pg-foot');

      function render() {
        var inc = store.selectedIncident;
        var stages = PX.data.stages;
        var at = store.stageOf(inc.id);
        var last = stages.length - 1;
        var keep = scroll.scrollTop;

        var padV = (tile.isShort ? 7 : 10) + 'px';
        bar.style.padding = padV + ' ' + tile.inset + 'px';
        foot.style.padding = padV + ' ' + tile.inset + 'px';

        // ── 머리줄 ──
        bar.innerHTML =
          PX.dot(inc.priority) +
          '<span class="pg-id">' + esc(inc.id + ' ' + inc.type) + '</span>' +
          '<span class="pg-spacer"></span>' +
          '<span class="cap sec">' + esc(stages[at] + ' ' + (at + 1) + '/' + stages.length) + '</span>';

        // ── 단계 목록 ──
        var lineH = (tile.isShort ? 20 : 34) + 'px';
        var rowPadV = (tile.isShort ? 3 : 6) + 'px';
        var h = [];
        stages.forEach(function (name, idx) {
          h.push('<div class="pg-row" style="padding:' + rowPadV + ' ' + tile.inset + 'px">');
          h.push('<div class="pg-rail">');
          h.push('<span class="pg-node' + (idx <= at ? ' on' : '') + '"></span>');
          if (idx < last) {
            h.push('<span class="pg-line' + (idx < at ? ' past' : '') + '" style="height:' + lineH + '"></span>');
          }
          h.push('</div>');
          h.push('<div class="pg-txt">');
          h.push('<div class="pg-name' + (idx === at ? ' now' : '') + '">' + esc(name) + '</div>');
          // 창이 아주 낮으면 상태 글자는 떨어낸다 (Swift 의 !tile.isVeryShort 와 같다)
          if (!tile.isVeryShort) {
            h.push('<div class="cap sec">' + (idx < at ? '완료' : idx === at ? '진행 중' : '예정') + '</div>');
          }
          h.push('</div></div>');
        });
        list.innerHTML = h.join('');

        // ── 발치 단추 ──
        foot.innerHTML =
          '<button type="button" class="pg-btn" data-act="prev"' + (at <= 0 ? ' disabled' : '') + '>이전 단계</button>' +
          '<button type="button" class="pg-btn primary" data-act="next"' + (at >= last ? ' disabled' : '') + '>다음 단계</button>';

        scroll.scrollTop = keep;
      }

      foot.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.pg-btn') : null;
        if (!b || b.disabled) return;
        var id = store.selectedIncident.id;
        if (b.dataset.act === 'prev') store.prevStage(id);   // store 쪽이 알아서 emit('stage') 한다
        else store.nextStage(id);
      });

      var off = store.subscribe(function (what) {
        if (what === 'incident' || what === 'stage') render();
      });

      render();

      return {
        resize: function (t) { tile = t; render(); },
        destroy: function () { off(); }
      };
    }
  };

})(window.PX);
