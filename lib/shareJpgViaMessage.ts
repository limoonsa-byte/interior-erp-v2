/** 기기 공유 시트로 JPG를 메시지(문자/MMS) 앱에 첨부해 보내기 */

export type ShareJpgResult = "shared" | "aborted" | "unsupported";

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  const s = `${e.name || ""} ${e.message || ""}`;
  return /AbortError|canceled|cancelled|The user canceled/i.test(s);
}

/** 공유용 File — ASCII 파일명 + image/jpeg 고정 (iOS MIME 검사 대응) */
export function toShareableJpegFile(source: Blob, fileName = "schedule.jpg"): File {
  const name = /\.jpe?g$/i.test(fileName) ? fileName.replace(/[^\w.\-]+/g, "_") : "schedule.jpg";
  const safe = name.length > 3 ? name : "schedule.jpg";
  return new File([source], safe.endsWith(".jpg") || safe.endsWith(".jpeg") ? safe : `${safe}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/** 이 기기에서 이미지 파일 공유(문자 첨부)가 가능한지 */
export function canShareJpegFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") {
    // Safari 일부: canShare 없음 → share 시도는 호출 시점에
    return true;
  }
  try {
    const probe = toShareableJpegFile(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * JPG를 OS 공유 시트로 넘긴다. 사용자가 「메시지/문자」를 고르면 MMS로 첨부됨.
 * sms: URI는 이미지 첨부 불가 → Web Share files 만 사용.
 */
export async function shareJpgViaMessage(opts: {
  file: Blob;
  text?: string;
  title?: string;
  fileName?: string;
}): Promise<ShareJpgResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }

  const file = toShareableJpegFile(opts.file, opts.fileName || "schedule.jpg");
  const title = (opts.title || "").trim() || undefined;
  const text = (opts.text || "").trim() || undefined;

  const payloads: ShareData[] = [{ files: [file] }];
  if (text) payloads.push({ files: [file], text });
  if (title) payloads.push({ files: [file], title });
  if (title && text) payloads.push({ files: [file], title, text });

  let sawAbort = false;
  let lastError: unknown = null;

  for (const data of payloads) {
    try {
      if (typeof navigator.canShare === "function") {
        // canShare는 files만 검사하는 것이 안정적 (text 조합 시 false 나는 기기 많음)
        if (!navigator.canShare({ files: [file] })) {
          return "unsupported";
        }
      }
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if (isAbortError(err)) {
        sawAbort = true;
        break;
      }
      lastError = err;
      // 다음 payload 시도 (files+text 거부 등)
    }
  }

  if (sawAbort) return "aborted";

  // 마지막 재시도: files only, canShare 건너뛰기
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (err) {
    if (isAbortError(err)) return "aborted";
    console.error("shareJpgViaMessage failed:", lastError || err);
    return "unsupported";
  }
}
