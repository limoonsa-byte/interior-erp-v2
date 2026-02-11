// ========================================
// 전체 복사용 code.gs 파일
// 사용법: 이 파일 전체를 복사해서 Apps Script의 code.gs에 붙여넣기
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

/** HTML include */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ========================================
// ⚠️ 주의: 아래부터는 기존 코드를 그대로 복사하되,
// doPost 함수의 === 는 == 로 변경하세요 (3곳)
// ========================================
// 
// 기존 code.gs 파일에서 doPost 함수부터 setupPriceTables 함수까지
// 모든 코드를 그대로 복사하되, === 를 == 로 변경하세요.
//
// 그리고 파일 맨 아래에 다음 함수를 추가하세요:
//
