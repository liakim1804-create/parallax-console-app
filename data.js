/* ─────────────────────────────────────────────────────────────
 * PARALLAX 통제실 — 표본 데이터 (data.js)
 * SwiftUI 앱(ParallaxConsole)의 SampleData.swift / Models.swift 를 그대로 옮긴 것.
 * 모든 값은 시연용 가상 자료이며 실제 사건·인물·위치가 아니다.
 * 일반 <script> 로 불러 쓴다 (ES module 아님). 데이터만 담고 로직은 담지 않는다.
 * ───────────────────────────────────────────────────────────── */

window.PX = window.PX || {};
var PX = window.PX;   // node 로 검사할 때도 같은 코드가 돌도록 두는 별칭

PX.data = {

  // ═══ 낱말 목록 (Swift 의 enum raw value) ═══════════════════════
  priorities: ["긴급", "주의", "일반"],          // Priority — 색은 지도·목록에서 원으로만 표시한다
  arLinks: ["연결", "불안정", "두절", "미연결"],  // ARLink — AR 글래스 연결 상태
  messageKinds: ["일반", "중요", "긴급"],        // MessageKind

  /// 사건 처리 8단계 (Stage)
  stages: [
    "신고 접수", "출동 지령", "현장 도착", "상황 판단",
    "현장 통제", "조치 시행", "상황 종료 준비", "사건 종료"
  ],

  // ═══ 지도 좌표계 ═══════════════════════════════════════════════
  //  웹 판과 같은 가상 좌표계(1000 x 680)를 서울 도심에 고정 비율로 대응시킨다.
  //  시연용 배치이며 실제 위치가 아니다.
  mapPoint: {
    lon0: 126.935, lon1: 127.065,
    lat0: 37.603,  lat1: 37.537,
    toLatLng: function (p) {
      var m = PX.data.mapPoint;
      return {
        latitude:  m.lat0 + (p.y / 680)  * (m.lat1 - m.lat0),
        longitude: m.lon0 + (p.x / 1000) * (m.lon1 - m.lon0)
      };
    }
  },

  /// 표본 데이터가 멈춰 있는 시각 — 여기가 「지금」이다 (자정부터 분)
  clock: { nowMin: 21 * 60 },

  // ═══ ConsoleStore 가 들고 있던 초기값 ══════════════════════════
  initial: {
    /// 선택한 사건 (모든 화면이 이 값을 따라간다)
    selectedIncidentID: "A-102",
    darkMode: false,
    soundOn: true,
    /// 메시지 창: 받는 대상별 임시 입력
    drafts: {},
    /// 현장 정보 전송: 고른 항목과 대상
    txItems: [],
    txTargets: [],
    txNote: "",
    txSent: [],
    /// 인계 기록
    handoverDone: []
  },

  /// 사건 처리 단계 (사건별 현재 단계 번호)
  stageIndex: {
    "A-102": 5, "A-104": 4, "A-107": 5, "A-109": 3,
    "A-111": 2, "A-113": 6, "A-098": 7
  },

  // ═══ 사건 ══════════════════════════════════════════════════════
  //  risk 는 0~100, point 는 가상 좌표(1000 x 680), isActive 는 status !== "종료"
  incidents: [
    {
      id: "A-102", type: "주택 침입 의심", place: "하늘동 12로 34 다세대주택",
      priority: "긴급", risk: 82, reportedAt: "20:41", team: "강력1팀", status: "진행 중",
      updatedAt: "20:57",
      summary: "다세대주택 3층 세대 침입 의심. 내부 인원 유무 미확인. 유리 파손음 청취 신고.",
      call: "\"윗집에서 유리 깨지는 소리와 남성 고성이 들린다. 현관문이 열려 있는 것 같다.\"",
      hazards: ["깨진 유리 파편", "3층 외부 비상계단 노후", "내부 조도 매우 낮음"],
      point: { x: 250, y: 196 }
    },
    {
      id: "A-104", type: "상가 흉기 위협 신고", place: "새빛로 27 상가 2층",
      priority: "긴급", risk: 88, reportedAt: "20:49", team: "형사2팀", status: "진행 중",
      updatedAt: "20:58",
      summary: "상가 2층 음식점 내 흉기 위협. 다중 이용시설로 대피 유도 필요. 부상자 여부 미확인.",
      call: "\"손님끼리 시비 중 한 명이 흉기를 꺼냈다. 사람이 많다.\"",
      hazards: ["다중 이용시설(체류 인원 다수)", "흉기 소지 추정", "계단 1개소 단일 통로"],
      point: { x: 636, y: 148 }
    },
    {
      id: "A-107", type: "다중 추돌 교통사고", place: "중앙대로 3교차로",
      priority: "주의", risk: 54, reportedAt: "20:22", team: "교통1팀", status: "진행 중",
      updatedAt: "20:53",
      summary: "차량 4대 연쇄 추돌. 경상 2명 이송 완료. 노면 유류 유출로 2차 사고 우려.",
      call: "\"교차로에서 차량 4대가 연쇄 추돌했다. 기름이 흐르는 것 같다.\"",
      hazards: ["노면 유류 유출", "정차 차량 후미 추돌 위험", "견인 작업 중"],
      point: { x: 540, y: 440 }
    },
    {
      id: "A-109", type: "아동 실종 신고", place: "한들공원 일대",
      priority: "주의", risk: 61, reportedAt: "19:58", team: "여성청소년팀", status: "수색 중",
      updatedAt: "20:56",
      summary: "9세 아동(가상) 실종. 최종 목격 놀이터 동측. 공원 4개 구역 분할 수색 진행.",
      call: "\"9세 아동이 공원 놀이터에서 30분째 보이지 않는다.\"",
      hazards: ["공원 저수지 인접", "야간 조도 저하", "출입구 5개소 분산"],
      point: { x: 672, y: 352 }
    },
    {
      id: "A-111", type: "차량 도난 추적", place: "서강로 지하주차장 B2",
      priority: "주의", risk: 46, reportedAt: "20:11", team: "강력2팀", status: "확인 중",
      updatedAt: "20:44",
      summary: "승용차 1대 도난 신고(가상 번호 12가 3456). 출차 기록 대조 중. 인접 CCTV 4개소 확인 필요.",
      call: "\"주차해 둔 차량이 없어졌다. 유리 파편이 남아 있다.\"",
      hazards: ["지하 통신 음영 구간", "차량 출입구 2개소"],
      point: { x: 848, y: 512 }
    },
    {
      id: "A-113", type: "소음·소란 신고", place: "미르동 원룸촌 4길",
      priority: "일반", risk: 22, reportedAt: "20:35", team: "지역2팀", status: "현장 도착",
      updatedAt: "20:51",
      summary: "반복 소음 신고(당월 3회차). 현장 계도 진행. 물리적 충돌 없음.",
      call: "\"옆 건물에서 새벽까지 큰 음악 소리가 난다.\"",
      hazards: [],
      point: { x: 208, y: 540 }
    },
    {
      id: "A-098", type: "주취자 보호조치", place: "중앙시장 앞",
      priority: "일반", risk: 12, reportedAt: "18:20", team: "지역1팀", status: "종료",
      updatedAt: "19:05",
      summary: "보호조치 후 귀가 조치 완료. 추가 조치 없음.",
      call: "\"길에 사람이 누워 있다.\"",
      hazards: [],
      point: { x: 400, y: 300 }
    }
  ],

  // ═══ 인력 ══════════════════════════════════════════════════════
  //  incidentID 가 null 이면 대기
  officers: [
    { id: "O-11", call: "한들-1", name: "김도현 경위", team: "강력1팀", incidentID: "A-102",
      task: "전면 현관 진입로 확보", state: "현장 대응 중", ar: "연결", battery: 88, commAt: "20:58",
      point: { x: 262, y: 178 } },
    { id: "O-12", call: "한들-2", name: "박서준 경사", team: "강력1팀", incidentID: "A-102",
      task: "후면 비상계단 감시", state: "이동 중", ar: "연결", battery: 61, commAt: "20:57",
      point: { x: 214, y: 232 } },
    { id: "O-13", call: "순찰-7", name: "최유나 경장", team: "지역1팀", incidentID: "A-102",
      task: "외곽 차단 및 주민 통제", state: "현장 도착", ar: "미연결", battery: 44, commAt: "20:54",
      point: { x: 316, y: 268 } },
    { id: "O-21", call: "새빛-1", name: "정민석 경위", team: "형사2팀", incidentID: "A-104",
      task: "2층 영업장 진입 준비", state: "현장 대응 중", ar: "연결", battery: 76, commAt: "20:58",
      point: { x: 640, y: 160 } },
    { id: "O-22", call: "새빛-4", name: "오세아 경사", team: "형사2팀", incidentID: "A-104",
      task: "주출입구 통제·대피 유도", state: "현장 도착", ar: "불안정", battery: 53, commAt: "20:56",
      point: { x: 612, y: 132 } },
    { id: "O-31", call: "교통-3", name: "한지훈 경사", team: "교통1팀", incidentID: "A-107",
      task: "서측 차로 통제", state: "진행 중", ar: "미연결", battery: 92, commAt: "20:53",
      point: { x: 520, y: 424 } },
    { id: "O-41", call: "여청-2", name: "문가람 경위", team: "여성청소년팀", incidentID: "A-109",
      task: "공원 동측 수림대 수색", state: "수색 중", ar: "연결", battery: 69, commAt: "20:56",
      point: { x: 700, y: 340 } },
    { id: "O-42", call: "순찰-12", name: "강태오 경장", team: "지역2팀", incidentID: "A-109",
      task: "공원 서측 출입구 확인", state: "수색 중", ar: "연결", battery: 33, commAt: "20:55",
      point: { x: 628, y: 366 } },
    { id: "O-51", call: "강력-5", name: "임하늘 경사", team: "강력2팀", incidentID: "A-111",
      task: "주차장 출입 기록 확인", state: "확인 중", ar: "미연결", battery: 81, commAt: "20:44",
      point: { x: 838, y: 506 } },
    { id: "O-61", call: "지역-9", name: "서지오 경장", team: "지역2팀", incidentID: "A-113",
      task: "현장 계도", state: "현장 도착", ar: "미연결", battery: 58, commAt: "20:51",
      point: { x: 214, y: 532 } },
    // 대기 인력 (사건에 배정했다가 뺄 수 있다)
    { id: "O-71", call: "대기-1", name: "유시윤 경장", team: "지역3팀", incidentID: null,
      task: "대기 중", state: "대기", ar: "연결", battery: 97, commAt: "20:58",
      point: { x: 430, y: 236 } },
    { id: "O-72", call: "대기-2", name: "조하린 경사", team: "지역3팀", incidentID: null,
      task: "대기 중", state: "대기", ar: "연결", battery: 84, commAt: "20:57",
      point: { x: 476, y: 300 } },
    { id: "O-73", call: "기동-4", name: "남건우 경위", team: "기동1팀", incidentID: null,
      task: "대기 중", state: "대기", ar: "미연결", battery: 73, commAt: "20:55",
      point: { x: 760, y: 470 } },
    { id: "O-74", call: "여청-5", name: "배수아 경장", team: "여성청소년팀", incidentID: null,
      task: "대기 중", state: "대기", ar: "연결", battery: 61, commAt: "20:56",
      point: { x: 330, y: 430 } }
  ],

  // ═══ 차량 ══════════════════════════════════════════════════════
  vehicles: [
    { id: "V-31", label: "순찰차 31호", incidentID: "A-102", crew: "순찰-7",  point: { x: 322, y: 292 } },
    { id: "V-08", label: "순찰차 08호", incidentID: "A-104", crew: "새빛-4",  point: { x: 720, y: 214 } },
    { id: "V-45", label: "교통 45호",   incidentID: "A-107", crew: "교통-3",  point: { x: 470, y: 452 } },
    { id: "V-12", label: "순찰차 12호", incidentID: "A-109", crew: "순찰-12", point: { x: 590, y: 300 } },
    { id: "V-20", label: "순찰차 20호", incidentID: "A-111", crew: "강력-5",  point: { x: 896, y: 476 } },
    { id: "V-27", label: "순찰차 27호", incidentID: "A-113", crew: "지역-9",  point: { x: 262, y: 502 } },
    { id: "V-60", label: "순찰차 60호", incidentID: null,    crew: "대기-1",  point: { x: 452, y: 268 } },
    { id: "V-63", label: "순찰차 63호", incidentID: null,    crew: "기동-4",  point: { x: 706, y: 506 } },
    { id: "V-77", label: "승합 77호",   incidentID: null,    crew: "여청-5",  point: { x: 352, y: 412 } }
  ],

  // ═══ CCTV ══════════════════════════════════════════════════════
  //  facing = 어느 쪽을 보는가(방위각 0=북, 시계 방향) · fov = 화각(가로, 도) · range = 닿는 거리(m)
  cameras: [
    { id: "C-01", name: "하늘동 12로 입구",  incidentID: "A-102", traffic: "원활", point: { x: 196, y: 168 }, facing: 70,  fov: 62, range: 36 },
    { id: "C-02", name: "하늘동 주택가 골목", incidentID: "A-102", traffic: "원활", point: { x: 302, y: 152 }, facing: 160, fov: 58, range: 40 },
    { id: "C-03", name: "하늘동 교차로",     incidentID: "A-102", traffic: "서행", point: { x: 340, y: 280 }, facing: 215, fov: 66, range: 42 },
    { id: "C-04", name: "새빛로 상가 전면",   incidentID: "A-104", traffic: "정체", point: { x: 592, y: 120 }, facing: 45,  fov: 64, range: 38 },
    { id: "C-05", name: "새빛로 후면 주차장", incidentID: "A-104", traffic: "서행", point: { x: 706, y: 186 }, facing: 200, fov: 60, range: 36 },
    { id: "C-06", name: "중앙대로 3교차로",   incidentID: "A-107", traffic: "통제", point: { x: 540, y: 406 }, facing: 90,  fov: 78, range: 48 },
    { id: "C-07", name: "한들공원 서문",     incidentID: "A-109", traffic: "원활", point: { x: 596, y: 322 }, facing: 20,  fov: 70, range: 62 },
    { id: "C-08", name: "한들공원 저수지",    incidentID: "A-109", traffic: "원활", point: { x: 740, y: 400 }, facing: 210, fov: 66, range: 56 },
    { id: "C-09", name: "서강로 주차장 출구", incidentID: "A-111", traffic: "서행", point: { x: 888, y: 548 }, facing: 200, fov: 62, range: 34 },
    { id: "C-10", name: "미르동 원룸촌 4길",  incidentID: "A-113", traffic: "원활", point: { x: 176, y: 512 }, facing: 40,  fov: 60, range: 32 }
  ],

  // ═══ 출동 경로 (재생용) ════════════════════════════════════════
  //  마지막 지점은 그 인력의 **지금 위치와 같다** — 그래야 재생을 끝까지 돌렸을 때
  //  화면이 평소 지도와 정확히 겹친다. 출동 전 시각에는 지도에 세우지 않는다.
  //  t 는 자정부터 분 (20:49 → 1249), p 는 지도 좌표
  patrolRoutes: [
    { id: "O-11", incidentID: "A-102", stops: [
      { t: 1244, p: { x: 398, y: 262 } }, { t: 1248, p: { x: 330, y: 214 } },
      { t: 1252, p: { x: 288, y: 186 } }, { t: 1258, p: { x: 262, y: 178 } }
    ] },
    { id: "O-12", incidentID: "A-102", stops: [
      { t: 1244, p: { x: 352, y: 320 } }, { t: 1249, p: { x: 286, y: 286 } },
      { t: 1253, p: { x: 236, y: 254 } }, { t: 1257, p: { x: 214, y: 232 } }
    ] },
    { id: "O-13", incidentID: "A-102", stops: [
      { t: 1245, p: { x: 430, y: 344 } }, { t: 1249, p: { x: 384, y: 310 } },
      { t: 1252, p: { x: 344, y: 284 } }, { t: 1254, p: { x: 316, y: 268 } }
    ] },

    { id: "O-21", incidentID: "A-104", stops: [
      { t: 1252, p: { x: 748, y: 232 } }, { t: 1255, p: { x: 690, y: 190 } },
      { t: 1258, p: { x: 640, y: 160 } }
    ] },
    { id: "O-22", incidentID: "A-104", stops: [
      { t: 1252, p: { x: 700, y: 58 } }, { t: 1254, p: { x: 664, y: 92 } },
      { t: 1256, p: { x: 612, y: 132 } }
    ] },

    { id: "O-31", incidentID: "A-107", stops: [
      { t: 1228, p: { x: 398, y: 382 } }, { t: 1236, p: { x: 452, y: 400 } },
      { t: 1245, p: { x: 492, y: 414 } }, { t: 1253, p: { x: 520, y: 424 } }
    ] },

    { id: "O-41", incidentID: "A-109", stops: [
      { t: 1207, p: { x: 556, y: 268 } }, { t: 1220, p: { x: 608, y: 296 } },
      { t: 1235, p: { x: 664, y: 318 } }, { t: 1248, p: { x: 716, y: 330 } },
      { t: 1256, p: { x: 700, y: 340 } }
    ] },
    { id: "O-42", incidentID: "A-109", stops: [
      { t: 1231, p: { x: 536, y: 430 } }, { t: 1240, p: { x: 572, y: 404 } },
      { t: 1248, p: { x: 606, y: 382 } }, { t: 1255, p: { x: 628, y: 366 } }
    ] },

    { id: "O-51", incidentID: "A-111", stops: [
      { t: 1220, p: { x: 940, y: 586 } }, { t: 1230, p: { x: 896, y: 548 } },
      { t: 1238, p: { x: 860, y: 520 } }, { t: 1244, p: { x: 838, y: 506 } }
    ] },

    { id: "O-61", incidentID: "A-113", stops: [
      { t: 1244, p: { x: 104, y: 470 } }, { t: 1247, p: { x: 156, y: 502 } },
      { t: 1251, p: { x: 214, y: 532 } }
    ] }
  ],

  // ═══ 묶음 사건 (여러 신고를 하나로 묶은 것) ════════════════════
  caseGroups: [
    { id: "K-01", title: "하늘동 주택 침입",     reportIDs: ["A-102"], note: null },
    { id: "K-02", title: "새빛로 상가 흉기 위협", reportIDs: ["A-104"], note: null },
    { id: "K-03", title: "도난 차량 도주·추돌",   reportIDs: ["A-111", "A-107"],
      note: "도난 차량이 교차로 추돌에 연루된 것으로 보여 묶음 (가상)" },
    { id: "K-04", title: "한들공원 아동 실종",   reportIDs: ["A-109"], note: null },
    { id: "K-05", title: "미르동 소음 신고",     reportIDs: ["A-113"], note: null }
  ],

  // ═══ 메시지 ════════════════════════════════════════════════════
  //  Swift 는 UUID 를 쓰지만 웹에서는 고정 문자열 id 를 준다 (표본이라 재생성할 일이 없다)
  messages: [
    { id: "M-01", incidentID: "A-102", from: "지휘통제실", to: "현장팀 전체", kind: "일반",
      text: "한들-1, 현장 도착 시 전면 상황 먼저 보고 바랍니다.", time: "20:48",
      isRead: true, isMine: true, isPinned: false },
    { id: "M-02", incidentID: "A-102", from: "한들-1", to: "지휘통제실", kind: "일반",
      text: "현장 도착. 3층 현관문 개방 상태 확인했습니다.", time: "20:49",
      isRead: true, isMine: false, isPinned: false },
    { id: "M-03", incidentID: "A-102", from: "지휘통제실", to: "후속팀 전체", kind: "중요",
      text: "지역1팀 1개조 12로 남측 집결 지점으로 이동하십시오.", time: "20:55",
      isRead: true, isMine: true, isPinned: false },
    { id: "M-04", incidentID: "A-102", from: "순찰-7", to: "지휘통제실", kind: "일반",
      text: "외곽 차단선 설정 완료. 주민 4명 대피 유도했습니다.", time: "20:57",
      isRead: false, isMine: false, isPinned: false }
  ],

  // ═══ 알림 ══════════════════════════════════════════════════════
  //  isMine: 내가 보낸 지시로 생긴 알림은 표식을 띄우지 않는다
  alerts: [
    { id: "AL-01", level: "주의", title: "작전 변경",
      detail: "A-102 진입 방향을 후면에서 전면으로 변경했습니다.",
      time: "20:55:12", incidentID: "A-102", seen: true, isMine: false },
    { id: "AL-02", level: "일반", title: "기록 저장",
      detail: "A-107 처리 기록이 저장되었습니다.",
      time: "20:53:40", incidentID: "A-107", seen: true, isMine: false }
  ],

  // ═══ 사건마다 다른 공간 기록 ═══════════════════════════════════
  //  현장이 다르면 스캔도 달라야 한다. 상가 흉기 신고에 주택 스캔이 뜨면 말이 안 된다.
  //  실제로 스캔해 온 네 곳을 사건 성격에 맞춰 나눠 붙였다.
  //  아직 그 현장을 스캔하지 않은 사건은 가장 가까운 성격의 공간을 대신 띄우고,
  //  화면에 「대표 공간」이라고 밝힌다 — 없는 것을 있는 척하지 않는다.
  spaceScan: {
    fallback: "20260914-135539",

    /// 사건 → 스캔 id
    byIncident: {
      "A-102": "20260914-135539",   // 다세대주택 실내 ← 학교 실내
      "A-104": "20260914-173325",   // 상가 다중이용시설 ← 넓은 실내
      "A-107": "20260915-224931",   // 도로 ← 계원대학로 실외
      "A-109": "20260914-190714",   // 공원 ← 내손동 실외
      "A-111": "20260915-224931",   // 주차장 ← 계원대학로 실외
      "A-113": "20260914-135539",   // 다세대 실내 ← 학교 실내
      "A-098": "20260914-190714"
    },

    /// 그 현장을 **직접** 스캔한 사건. 나머지는 대표 공간이다
    own: ["A-102", "A-104"],

    of: function (inc) {
      var s = PX.data.spaceScan;
      return s.byIncident[inc] || s.fallback;
    },
    isOwn: function (inc) { return PX.data.spaceScan.own.indexOf(inc) !== -1; }
  }
};

// node 로 문법·개수를 확인할 때 쓴다 (브라우저에서는 무시된다)
if (typeof module !== "undefined" && module.exports) { module.exports = PX.data; }
