/** 브라우저에서 첨부(사진/이미지)를 반드시 1MB 이하 JPEG로 자동 축소 */

export type CompressedAttachment = {
  blob: Blob;
  mime: string;
  name: string;
  compressed: boolean;
  bytes: number;
};

/** 서버·JSON(base64) 여유를 위해 목표를 1MB보다 작게 */
const TARGET_RATIO = 0.82;

function toJpgName(name: string): string {
  const raw = (name || "photo").trim() || "photo";
  const base = raw.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

/** 카메라/갤러리/파일 칸에서 온 입력이 이미지로 보여야 하는지 */
export function isImageLike(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  if (/\.(jpe?g|png|webp|gif|heic|heif|bmp|tif|tiff)$/i.test(file.name || "")) return true;
  // 휴대폰이 이름/타입 없이 넘기는 경우 (image, blob, 숫자만 등)
  const n = (file.name || "").trim().toLowerCase();
  if (!n || n === "image" || n === "blob" || n === "photo" || /^\d+$/.test(n)) {
    return !type || type.startsWith("image/") || type === "application/octet-stream";
  }
  return false;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* fallback below */
      }
    }
  }

  // Image() 오브젝트 URL
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("fail"));
      };
      img.src = url;
    });
  } catch {
    /* FileReader data URL fallback */
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("이미지를 불러오지 못했습니다. JPG/PNG로 다시 찍어 주세요."));
      img.src = String(reader.result || "");
    };
    reader.onerror = () =>
      reject(new Error("이미지를 불러오지 못했습니다. JPG/PNG로 다시 찍어 주세요."));
    reader.readAsDataURL(file);
  });
}

function getSize(source: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  if ("naturalWidth" in source) {
    return {
      w: source.naturalWidth || source.width || 1,
      h: source.naturalHeight || source.height || 1,
    };
  }
  return { w: source.width || 1, h: source.height || 1 };
}

function drawToCanvas(source: ImageBitmap | HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const { w: w0, h: h0 } = getSize(source);
  const scale = Math.min(1, maxEdge / Math.max(w0, h0, 1));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
  if (!ctx) throw new Error("이미지 압축을 지원하지 않는 환경입니다.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const q = Math.min(1, Math.max(0.05, quality));
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          // 일부 WebView에서 toBlob null → dataURL 폴백
          try {
            const dataUrl = canvas.toDataURL("image/jpeg", q);
            const bin = atob(dataUrl.split(",")[1] || "");
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            resolve(new Blob([arr], { type: "image/jpeg" }));
          } catch (e) {
            reject(e instanceof Error ? e : new Error("이미지 압축에 실패했습니다."));
          }
        },
        "image/jpeg",
        q
      );
      return;
    }
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", q);
      const bin = atob(dataUrl.split(",")[1] || "");
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type: "image/jpeg" }));
    } catch (e) {
      reject(e instanceof Error ? e : new Error("이미지 압축에 실패했습니다."));
    }
  });
}

/** 품질 이분 탐색으로 maxBytes 이하 JPEG 생성 */
async function encodeUnderBytes(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob | null> {
  let lo = 0.08;
  let hi = 0.9;
  let best: Blob | null = null;

  // 먼저 중간 품질로 빠르게 판별
  const probe = await canvasToJpegBlob(canvas, 0.72);
  if (probe.size <= maxBytes) {
    best = probe;
    lo = 0.72;
  } else {
    hi = 0.72;
  }

  for (let i = 0; i < 10; i++) {
    const q = (lo + hi) / 2;
    const blob = await canvasToJpegBlob(canvas, q);
    if (blob.size <= maxBytes) {
      best = blob;
      lo = q;
    } else {
      hi = q;
    }
  }

  if (!best || best.size > maxBytes) {
    const blob = await canvasToJpegBlob(canvas, 0.08);
    if (blob.size <= maxBytes) best = blob;
  }
  return best && best.size <= maxBytes ? best : null;
}

async function compressImageToMax(file: File, maxBytes: number): Promise<CompressedAttachment> {
  const hardMax = maxBytes;
  const target = Math.max(180 * 1024, Math.floor(hardMax * TARGET_RATIO));
  const source = await loadBitmap(file);
  try {
    // 큰 휴대폰 사진부터 아주 작게까지 단계적으로 줄임
    const maxEdges = [1600, 1280, 1024, 900, 720, 640, 480, 360, 280, 200, 160];
    let smallest: Blob | null = null;

    for (const edge of maxEdges) {
      const canvas = drawToCanvas(source, edge);
      const blob = await encodeUnderBytes(canvas, target);
      if (blob) {
        return {
          blob,
          mime: "image/jpeg",
          name: toJpgName(file.name),
          compressed: true,
          bytes: blob.size,
        };
      }
      const fallback = await canvasToJpegBlob(canvas, 0.08);
      if (!smallest || fallback.size < smallest.size) smallest = fallback;
      if (fallback.size <= hardMax) {
        return {
          blob: fallback,
          mime: "image/jpeg",
          name: toJpgName(file.name),
          compressed: true,
          bytes: fallback.size,
        };
      }
    }

    if (smallest && smallest.size <= hardMax) {
      return {
        blob: smallest,
        mime: "image/jpeg",
        name: toJpgName(file.name),
        compressed: true,
        bytes: smallest.size,
      };
    }

    throw new Error("사진을 1MB 이하로 줄이지 못했습니다. 다시 찍어 주세요.");
  } finally {
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
      source.close();
    }
  }
}

/**
 * 사진/이미지는 무조건 1MB 이하 JPEG로 줄인다.
 * 일반 파일(비이미지)은 1MB 이하면 그대로, 초과면 이미지 디코딩 시도 후 실패 시 오류.
 */
export async function compressAttachmentFile(
  file: File,
  maxBytes: number,
  opts?: { forceImage?: boolean }
): Promise<CompressedAttachment> {
  const forceImage = opts?.forceImage === true;
  const looksImage = isImageLike(file);

  if (forceImage || looksImage) {
    try {
      const out = await compressImageToMax(file, maxBytes);
      if (out.bytes > maxBytes) {
        throw new Error(`첨부를 1MB 이하로 만들지 못했습니다. (${out.name})`);
      }
      return out;
    } catch (e) {
      // 사진 칸(강제)은 원본 통과 금지 — 반드시 1MB 이하 JPEG
      if (forceImage) {
        throw e instanceof Error
          ? e
          : new Error("이미지를 1MB 이하로 줄이지 못했습니다. JPG로 다시 첨부해 주세요.");
      }
      // 파일 칸: HEIC 등 디코드 실패 + 이미 1MB 이하면 원본 허용
      if (file.size <= maxBytes) {
        return {
          blob: file,
          mime: file.type || "application/octet-stream",
          name: file.name || "file",
          compressed: false,
          bytes: file.size,
        };
      }
      throw e instanceof Error
        ? e
        : new Error("이미지를 1MB 이하로 줄이지 못했습니다. JPG로 다시 첨부해 주세요.");
    }
  }

  // 비이미지로 보이지만 용량 초과 → 갤러리 사진일 수 있어 디코드 시도
  if (file.size > maxBytes) {
    try {
      return await compressImageToMax(file, maxBytes);
    } catch {
      throw new Error(
        `파일은 1MB 이하여야 합니다. (${file.name || "file"}) 사진이면 사진 첨부를 이용해 주세요.`
      );
    }
  }

  return {
    blob: file,
    mime: file.type || "application/octet-stream",
    name: file.name || "file",
    compressed: false,
    bytes: file.size,
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}
