// ========================================
// 기존 doGet 함수에 추가할 부분 (맨 위에 추가)
// ========================================

function doGet(e) {
  e = e || {};
  var params = e.parameter || {};

  // ★ ERP 도면 목록 API: ?action=list 일 때 JSON 배열 반환
  if (params.action == 'list') {
    try {
      var list = getDrawingListForErp_();
      return ContentService.createTextOutput(list)
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: String(err.message || err) }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    }
  }

  // 기존 코드는 그대로 유지...
  if (params.downloadPdf && (params.fileId || params.siteName)) {
    // ... (기존 코드)
  }
  // ... (기존 코드)
}


// ========================================
// 기존 doGet 함수의 === 를 == 로 변경
// ========================================
// 다음 부분들을 찾아서 === 를 == 로 변경하세요:
// - if (params.format === 'json') → if (params.format == 'json')
// 총 3곳 있습니다.


// ========================================
// 파일 맨 아래에 추가할 함수 (기존 함수들 뒤에 추가)
// ========================================

/**
 * ERP용 도면 보관함 목록 (저장시각, 현장명, 요약, 전체 데이터 JSON)
 * - 반환: JSON 문자열. 배열 [ { siteName, savedAt, summary, data }, ... ]
 */
function getDrawingListForErp_() {
  try {
    var ss = getSpreadsheet_();
    var sheet = getDrawingSheet_(ss);
    if (!sheet || sheet.getLastRow() < 2) return '[]';
    var lastRow = sheet.getLastRow();
    var rows = sheet.getRange(2, 1, lastRow, 5).getValues();
    var list = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var dVal = row[0];
      var siteName = String(row[1] || '').trim();
      var summary = String(row[3] || '').trim();
      var jsonStr = row[4];
      var savedAt = (dVal instanceof Date)
        ? Utilities.formatDate(dVal, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')
        : String(dVal || '');
      var data = null;
      if (typeof jsonStr == 'string' && jsonStr.trim()) {
        try {
          data = JSON.parse(jsonStr);
        } catch (e) {}
      }
      list.push({
        siteName: siteName,
        savedAt: savedAt,
        summary: summary,
        data: data
      });
    }
    list.sort(function(a, b) { return String(b.savedAt || '').localeCompare(String(a.savedAt || '')); });
    return JSON.stringify(list);
  } catch (e) {
    return '[]';
  }
}
