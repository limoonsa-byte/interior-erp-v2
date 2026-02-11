# 스마트 현장관리 ↔ 견적서 작성 연동

인테리어 ERP의 **견적서 작성** 페이지에서 [스마트 현장관리](https://limoonsa-byte.github.io/Smart-Field_project/pwa_index.html) PWA를 열고, 도면에서 읽은 **문 개수·방 면적·치수** 등을 견적 항목으로 받아오기 위한 규격입니다.

## 1. ERP 쪽 동작

- 견적서 작성 폼에 **「스마트 현장관리에서 가져오기」** 버튼이 있음.
- 이 버튼을 누르면 스마트 현장관리 페이지가 `?source=erp` 쿼리로 팝업 열림.
- 사용자가 스마트 현장관리에서 도면/치수 입력 후 **「견적서로 보내기」** 등을 누르면, 해당 앱이 아래 규격대로 `postMessage`를 보냄.
- ERP는 `postMessage`를 받아 견적 항목(치수, 문 개수, 방면적 등)을 자동으로 추가함.

## 2. 스마트 현장관리 쪽에서 보내야 할 메시지

ERP가 열어 둔 창이 **opener**이므로, 스마트 현장관리 페이지에서는 다음처럼 보내면 됩니다.

```javascript
// ERP가 열어 둔 부모 창으로 보내기 (같은 탭이어도 동작하려면 opener 또는 parent 사용)
const target = window.opener || window.parent;
const erpOrigin = "https://your-erp-domain.vercel.app"; // 실제 ERP 배포 도메인으로 변경

target.postMessage(
  {
    type: "SMART_FIELD_ESTIMATE_DATA",
    payload: {
      // 문 개수 (선택)
      doorCount: 5,

      // 방별 면적 m² (선택)
      roomAreas: [
        { name: "거실", area: 18.5 },
        { name: "안방", area: 12.2 },
        { name: "욕실", area: 4.1 },
      ],

      // 전체 면적 m² (선택)
      totalArea: 85,

      // 치수 메모 (선택) – 비고 등
      dimensions: "천장고 2.4m, 창문 2개",

      // 또는 견적 항목을 그대로 넘기고 싶을 때 (이걸 쓰면 위 필드보다 우선)
      // items: [
      //   { category: "도배", spec: "전체", unit: "식", qty: 1, unitPrice: 1500000, note: "" },
      // ],
    },
  },
  erpOrigin
);
```

- **반드시** `type: "SMART_FIELD_ESTIMATE_DATA"` 이고, 실제 데이터는 `payload` 안에 넣어야 합니다.
- `postMessage`의 두 번째 인자에는 **ERP가 서빙되는 도메인(origin)**을 넣어야 합니다.  
  (로컬: `http://localhost:3000`, 배포: `https://xxx.vercel.app` 등)

## 3. payload 필드 설명

| 필드         | 설명                    | ERP에서의 사용 |
|--------------|-------------------------|----------------|
| `doorCount`  | 문 개수                 | 견적 항목 “문” 1행 추가 (단위: 개) |
| `roomAreas`  | 방 이름 + 면적(m²) 배열  | 방별 “방면적” 행 추가 (단위: m²) |
| `totalArea`  | 전체 면적(m²)           | “전체면적” 1행 추가 (단위: m²) |
| `dimensions` | 치수/메모 텍스트        | 전체면적 행의 비고 또는 첫 항목 비고에 반영 |
| `items`      | 견적 항목 배열          | 이걸 넣으면 위 필드 무시하고 이 항목들로만 채움 |

- `items`를 보내면 **공종(category), 규격(spec), 단위(unit), 수량(qty), 단가(unitPrice), 비고(note)** 가 그대로 견적서에 들어갑니다.
- `items`를 안 보내면 `doorCount` / `roomAreas` / `totalArea` / `dimensions`로 위 테이블처럼 행을 만들어서 넣습니다.  
  이때 **단가는 0**으로 들어가므로, 사용자가 ERP에서 나중에 단가만 입력하면 됩니다.

## 4. 스마트 현장관리에서 확인할 것

- 도면/입력 화면에서 **문 개수, 방별 면적, 전체 면적, 치수 메모**를 변수로 갖고 있는지.
- “견적서로 보내기” 버튼(또는 유사 기능) 클릭 시:
  - `window.opener`(또는 `parent`)가 있는지 확인.
  - 있으면 위 형식으로 `postMessage` 호출.
- ERP가 **다른 도메인**에 있으므로, `postMessage` 두 번째 인자에 **ERP의 실제 origin**을 넣어야 합니다.

이렇게 맞추면, 견적서 작성 화면에서 “스마트 현장관리에서 가져오기”로 도면을 연 뒤, 스마트 현장관리에서 보내기만 하면 문 개수·방 면적·치수가 견적 항목에 자동으로 입력됩니다.

---

## 5. 도면 보관함 JSON → ERP payload 변환

도면 보관함에서 불러온 **데이터(JSON)** 한 덩어리를 그대로 쓰면 됩니다.

| ERP가 필요한 값 | 도면 JSON에서 가져오는 곳 |
|----------------|---------------------------|
| **문 개수** | `data.doors.length` |
| **방별 면적** | `data.zones` → 각 `{ name: zone.name, area: parseFloat(zone.area) }` |
| **전체 면적** | `data.zones` 면적 합계 |
| **치수 메모** | `data.height`(천장고), 요약 텍스트(구역/벽선/가구/문) |

### 5.1 payload 만드는 함수 (도면 JSON → ERP용)

도면 보관함에서 불러온 객체를 `drawingData`, 요약 텍스트를 `summary`(예: "구역 10 / 벽선 0 / 가구 7 / 문 8")라고 하면:

```javascript
function buildEstimatePayloadFromDrawing(drawingData, summary) {
  if (!drawingData) return null;
  var zones = drawingData.zones || [];
  var doors = drawingData.doors || [];
  var height = drawingData.height;
  var roomAreas = zones.map(function (z) {
    return { name: z.name || "", area: parseFloat(z.area) || 0 };
  });
  var totalArea = 0;
  roomAreas.forEach(function (r) { totalArea += r.area; });
  var dimensions = [];
  if (height) dimensions.push("천장고 " + (height / 1000).toFixed(1) + "m");
  if (summary) dimensions.push(summary);
  return {
    doorCount: doors.length,
    roomAreas: roomAreas,
    totalArea: totalArea,
    dimensions: dimensions.join(", "),
  };
}
```

### 5.2 "견적서로 보내기" 버튼에서 호출 예시

```javascript
var payload = buildEstimatePayloadFromDrawing(drawingData, summaryText);
if (payload && (window.opener || window.parent)) {
  var erpOrigin = "https://여기에-ERP-배포주소.vercel.app";
  (window.opener || window.parent).postMessage(
    { type: "SMART_FIELD_ESTIMATE_DATA", payload: payload },
    erpOrigin
  );
}
```

도면 보관함에서 불러온 JSON의 `zones`, `doors`, `height`와 요약 문자열만 넣어서 위처럼 보내면, ERP 견적서에 문 개수·방 면적·치수가 자동 입력됩니다.

---

## 6. ERP에서 도면 목록 불러오기 (권장)

작업성을 위해 **스마트 현장관리 쪽에서 보내는 대신, ERP에서 도면 목록 API를 호출해 불러오는 방식**을 권장합니다.

### 6.1 흐름

1. 견적서 작성 화면에서 **「도면 보관함에서 불러오기」** 클릭
2. 모달에서 **도면 목록 API URL** 입력 후 **「목록 불러오기」** 클릭
3. API에서 내려준 목록(현장명, 저장시각, 요약)이 테이블로 표시됨
4. 한 건 **「선택」** 클릭 → 해당 도면의 문 개수·방 면적·치수가 견적 항목에 자동 반영

### 6.2 스마트 현장관리 쪽에서 제공할 API 형식

**GET** 한 번으로 **도면 목록**을 JSON 배열로 반환하면 됩니다.

- **응답**: JSON 배열. 각 요소는 아래 필드 지원 (한글/영문 둘 다 가능).

| 필드 (영문) | 필드 (한글) | 설명 |
|-------------|-------------|------|
| `siteName`  | `현장명`    | 현장명 |
| `savedAt`   | `저장시각`  | 저장 시각 문자열 |
| `summary`   | `요약`     | 구역 N / 문 N 등 요약 |
| `data`      | `데이터`   | 도면 전체 JSON (`zones`, `doors`, `height` 포함) |

- **예시 응답**

```json
[
  {
    "siteName": "2026.02.06 범일 두산위브 포세이돈",
    "savedAt": "2026-02-06 12:19:08",
    "summary": "구역 10 / 벽선 0 / 가구 7 / 문 8",
    "data": {
      "siteName": "2026.02.06 범일 두산위브 포세이돈",
      "height": 2300,
      "zones": [{"name": "현관", "area": "2.89"}, {"name": "거실", "area": "23.12"}],
      "doors": [{"width": 900}, {"width": 900}]
    }
  }
]
```

- Google Apps Script Web App으로 시트를 읽어 위 형태로 `return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON)` 하면 됩니다.
- CORS: 스크립트에서 `doGet` 등에서 `setHeaders` 등으로 ERP 도메인을 허용하거나, 공개 실행 URL을 쓰면 브라우저에서 ERP가 해당 URL을 호출할 수 있습니다.

ERP는 위 URL을 **환경변수로 두지 않고**, 모달에서 사용자가 입력한 **도면 목록 API URL**로만 요청합니다. 스마트 현장관리에서 이 API를 만들고 URL을 알려주면, 견적서 작성 화면에서 그 URL을 넣고 목록 불러오기 → 선택만 하면 됩니다.
