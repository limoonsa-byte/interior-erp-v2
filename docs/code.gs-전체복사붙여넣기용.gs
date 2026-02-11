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

  if (params.downloadPdf && (params.fileId || params.siteName)) {
    try {
      var pdfBlob = null;
      var fileName = '견적서.pdf';
      if (params.fileId) {
        var fileId = String(params.fileId || '').trim();
        if (fileId) {
          var file = DriveApp.getFileById(fileId);
          pdfBlob = file.getBlob();
          fileName = file.getName();
        }
      }
      if (!pdfBlob && params.siteName) {
        var gen = generateEstimatePdf_(decodeURIComponent(String(params.siteName || '').trim()));
        if (gen && gen.blob) { pdfBlob = gen.blob; fileName = gen.name || fileName; }
      }
      if (!pdfBlob) {
        if (params.format == 'json') {
          return ContentService.createTextOutput(JSON.stringify({ error: 'no_sheet', message: '견적이 시트에 저장되지 않았습니다. 견적내기에서 "저장" 버튼을 눌러 먼저 저장한 뒤 PDF 저장을 시도해 주세요.' })).setMimeType(ContentService.MimeType.JSON);
        }
        return HtmlService.createHtmlOutput('<p>파일을 찾을 수 없습니다.</p>');
      }
      var b64 = Utilities.base64Encode(pdfBlob.getBytes());
      var chunkSize = 32000;
      var chunks = [];
      for (var i = 0; i < b64.length; i += chunkSize) chunks.push(b64.substring(i, Math.min(i + chunkSize, b64.length)));
      var fn = (fileName || '견적서.pdf').replace(/"/g, '').replace(/\\/g, '').replace(/</g, '').replace(/>/g, '');
      if (params.format == 'json') {
        return ContentService.createTextOutput(JSON.stringify({ chunks: chunks, name: fn })).setMimeType(ContentService.MimeType.JSON);
      }
      var chunksJson = JSON.stringify(chunks);
      var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>PDF 다운로드</title></head><body><p>다운로드 중...</p><script type="application/json" id="d">' + chunksJson + '</script><script>var c=JSON.parse(document.getElementById("d").textContent);var b=atob(c.join(""));var a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);var blob=new Blob([a],{type:"application/pdf"});var u=URL.createObjectURL(blob);var l=document.createElement("a");l.href=u;l.download="' + fn + '";l.click();document.body.innerHTML="<p>다운로드가 시작되었습니다.</p>";</script></body></html>';
      return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      if (params.format == 'json') {
        return ContentService.createTextOutput(JSON.stringify({ error: 'server', message: '다운로드 실패: ' + (err.message || err) })).setMimeType(ContentService.MimeType.JSON);
      }
      return HtmlService.createHtmlOutput('<p>다운로드 실패: ' + (err.message || err) + '</p>');
    }
  }
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('스마트 현장관리 V7')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/**
 * HTML 템플릿에서 다른 HTML 파일을 포함하기 위한 헬퍼 함수
 * index.html 등에서 <?= include('filename') ?> 형태로 사용
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


/**
 * 도면 보관함 목록 조회 (HTML에서 호출)
 * - 반환: 객체 배열 [ { siteName, savedAt, summary, data }, ... ]
 */
function getDatalist() {
  try {
    // getDrawingListForErp_ 함수가 없으면 빈 배열 반환
    if (typeof getDrawingListForErp_ != 'function') {
      Logger.log('getDrawingListForErp_ 함수가 없습니다.');
      return [];
    }
    // getSpreadsheet_ 또는 getDrawingSheet_ 함수가 없으면 빈 배열 반환
    if (typeof getSpreadsheet_ != 'function' || typeof getDrawingSheet_ != 'function') {
      Logger.log('getSpreadsheet_ 또는 getDrawingSheet_ 함수가 없습니다.');
      return [];
    }
    var jsonStr = getDrawingListForErp_();
    if (!jsonStr || jsonStr == '[]' || jsonStr == '') return [];
    var parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    Logger.log('getDatalist 오류: ' + e.toString());
    return [];
  }
}


/**
 * ERP용 도면 보관함 목록 (저장시각, 현장명, 요약, 전체 데이터 JSON)
 * - 반환: JSON 문자열. 배열 [ { siteName, savedAt, summary, data }, ... ]
 */
function getDrawingListForErp_() {
  try {
    // 필요한 함수가 없으면 빈 배열 반환
    if (typeof getSpreadsheet_ != 'function' || typeof getDrawingSheet_ != 'function') {
      Logger.log('getSpreadsheet_ 또는 getDrawingSheet_ 함수가 없습니다.');
      return '[]';
    }
    var ss = getSpreadsheet_();
    if (!ss) {
      Logger.log('스프레드시트를 가져올 수 없습니다.');
      return '[]';
    }
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
    Logger.log('getDrawingListForErp_ 오류: ' + e.toString());
    return '[]';
  }
}
