# 도면 보관함 목록 API 만드는 방법 (Google Apps Script)

스마트 현장관리에서 도면을 Google 스프레드시트에 저장해 두었다면, **Google Apps Script**로 “목록 JSON을 주는 API”를 만들 수 있습니다. 아래 순서대로 하면 됩니다.

---

## 1. 전제

- 도면 보관함 데이터가 **Google 스프레드시트** 한 시트에 있다.
- 시트 열 구성이 예를 들어 다음과 비슷하다:
  - **저장시각** (또는 1열)
  - **현장명** (또는 2열)
  - **천장고** (또는 3열)
  - **요약** (또는 4열)
  - **데이터(JSON)** (또는 5열) — 도면 전체 JSON 문자열

열 순서나 이름이 다르면 2단계 스크립트 안의 **열 인덱스/이름**만 본인 시트에 맞게 바꾸면 됩니다.

---

## 2. 스프레드시트에서 스크립트 열기

1. 도면 보관함 시트가 있는 **스프레드시트**를 연다.
2. 메뉴 **확장 프로그램** → **Apps Script** 를 누른다.
3. 새 프로젝트가 열리면, 기본 파일명 `Code.gs` 그대로 두거나 원하는 이름으로 바꾼다.

---

## 3. 아래 코드 붙여넣기

`Code.gs` (또는 메인 코드 파일) 전체를 지우고, 아래를 **그대로 붙여넣은 뒤** 시트 구조에 맞게 수정한다.

```javascript
/**
 * 도면 보관함 시트에서 목록을 읽어 JSON 배열로 반환하는 API
 * 배포: 배포 → 웹 앱 → 실행 사용자 "나" / 앱에 액세스 "모든 사용자" → 배포
 */
function doGet(e) {
  var sheet = getSheet();
  if (!sheet) {
    return jsonResponse({ error: "시트를 찾을 수 없습니다." }, 500);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse([]);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0]; // 1행 = 헤더
  var rows = [];

  // 2행부터 데이터 (인덱스 1부터)
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};

    // 열 순서에 맞게 매핑 (필요하면 인덱스 수정)
    // 예: [저장시각, 현장명, 천장고, 요약, 데이터JSON]
    var savedAt = row[0];   // 1열: 저장시각
    var siteName = row[1];  // 2열: 현장명
    var summary = row[3];   // 4열: 요약
    var dataStr = row[4];   // 5열: 데이터(JSON)

    obj.savedAt = savedAt != null ? String(savedAt) : "";
    obj.siteName = siteName != null ? String(siteName) : "";
    obj.summary = summary != null ? String(summary) : "";

    // 데이터(JSON) 문자열 → 객체 (ERP에서 zones, doors, height 사용)
    if (dataStr && String(dataStr).trim()) {
      try {
        obj.data = JSON.parse(String(dataStr));
      } catch (err) {
        obj.data = null;
      }
    } else {
      obj.data = null;
    }

    rows.push(obj);
  }

  return jsonResponse(rows);
}

/** 시트 가져오기: 현재 스크립트가 붙어 있는 스프레드시트의 "도면 보관함" 시트 */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 시트 이름이 "도면 보관함"이 아니면 아래를 실제 시트 이름으로 바꾸세요.
  var sheet = ss.getSheetByName("도면 보관함");
  if (!sheet) {
    sheet = ss.getSheets()[0]; // 없으면 첫 번째 시트
  }
  return sheet;
}

/** JSON 응답 + CORS 헤더 (다른 도메인에서 호출 가능하게) */
function jsonResponse(body, statusCode) {
  statusCode = statusCode || 200;
  var output = typeof body === "string" ? body : JSON.stringify(body);
  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
}
```

### 수정할 부분

- **열 순서**: 시트에서 “저장시각 / 현장명 / 천장고 / 요약 / 데이터(JSON)” 순서가 다르면  
  `row[0]`, `row[1]`, `row[3]`, `row[4]` 를 실제 열 인덱스에 맞게 바꾼다. (0부터 시작)
- **시트 이름**: 도면 보관함 시트 이름이 `"도면 보관함"`이 아니면 `getSheet()` 안의 `getSheetByName("도면 보관함")` 를 실제 시트 이름으로 바꾼다.

---

## 4. 저장 후 웹 앱으로 배포

1. Apps Script 편집기에서 **저장** (디스크 아이콘 또는 Ctrl+S).
2. 상단 **배포** → **새 배포**.
3. 연필 아이콘으로 **유형 선택** → **웹 앱** 선택.
4. 설정:
   - **실행 사용자**: **나**
   - **액세스 권한**: **모든 사용자** (또는 “앱에 액세스할 수 있는 사용자” 중 본인이 원하는 옵션)
5. **배포** 버튼 클릭.
6. **웹 앱 URL**이 생성된다. 형식은 대략 다음과 같다:
   - `https://script.google.com/macros/s/XXXXXXXXXX/exec`
7. 이 URL을 **복사**해 둔다.

---

## 5. ERP에서 사용하기

1. 인테리어 ERP **견적서 작성** 화면으로 간다.
2. **「도면 보관함에서 불러오기」** 를 누른다.
3. 모달이 뜨면 **도면 목록 API URL** 입력란에  
   방금 복사한 **웹 앱 URL** (`https://script.google.com/macros/s/.../exec`) 을 붙여넣는다.
4. **「목록 불러오기」** 를 누른다.
5. 현장명·저장시각·요약 목록이 뜨면, 원하는 행에서 **「선택」** 을 누르면  
   해당 도면의 문 개수·방 면적·치수가 견적 항목에 자동으로 들어간다.

---

## 6. 도면 보관함 시트가 다른 구조일 때

- 열이 **저장시각, 현장명, 천장고, 요약, 데이터(JSON)** 순이 **아닌** 경우:
  - 1행(헤더)을 보고 “저장시각이 몇 번째 열인지, 현장명은, 요약은, 데이터(JSON)는 몇 번째 열인지” 확인한 뒤,
  - 코드의 `row[0]`, `row[1]`, `row[3]`, `row[4]` 를 그 열 인덱스로 바꾼다.
- 시트가 **여러 개**이고 “도면 보관함”만 쓰는 경우:
  - `getSheetByName("도면 보관함")` 에 넣은 이름이 실제 시트 이름과 정확히 같으면 된다.

이렇게 하면 “도면 보관함 목록을 JSON 배열로 주는 API 주소”를 직접 만든 것이고, pwa_index.html 같은 앱 페이지 주소 대신 **이 API 주소**를 ERP 모달에 넣어 쓰면 됩니다.
