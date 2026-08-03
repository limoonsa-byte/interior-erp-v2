/** 브라우저에서 첨부(사진/이미지)를 반드시 1MB 이하 JPEG로 자동 축소 */

export type CompressedAttachment = {
  blob: Blob;
  mime: string;
  name: string;
  compressed: boolean;
  bytes: number;
};

/** 서버/전송 여유를 위해 목표를 1MB보다 조금 작게 */
const TARGET_RATIO = 0.9;

function toJpgName(name: string): string {
  const raw = (name || "photo").trim() || "photo";
  const base = raw.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

function isImageLike(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  if (/\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name || "")) return true;
  // 휴대폰 카메라가 이름 없이 넘기는 경우
  if (!file.name || file.name === "image" || file.name === "blob") {
    return !file.type || file.type.startsWith("image/") || file.type === "";
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
      /* fallback below */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 불러오지 못했습니다. 다시 찍어 주세요."));
    };
    img.src = url;
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
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("이미지 압축을 지원하지 않는 환경입니다.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const bin = atob(dataUrl.split(",")[1] || "");
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: "image/jpeg" }));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("이미지 압축에 실패했습니다."));
      }
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("이미지 압축에 실패했습니다."));
        else resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

/** 품질 이분 탐색으로 maxBytes 이하 JPEG 생성 */
async function encodeUnderBytes(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob | null> {
  let lo = 0.2;
  let hi = 0.92;
  let best: Blob | null = null;

  for (let i = 0; i < 8; i++) {
    const q = (lo + hi) / 2;
    const blob = await canvasToJpegBlob(canvas, q);
    if (blob.size <= maxBytes) {
      best = blob;
      lo = q; // 더 높은 품질 시도
    } else {
      hi = q;
    }
  }

  // 마지막 낮은 품질로 한 번 더
  if (!best || best.size > maxBytes) {
    const blob = await canvasToJpegBlob(canvas, Math.max(0.15, hi * 0.85));
    if (blob.size <= maxBytes) best = blob;
  }
  return best && best.size <= maxBytes ? best : null;
}

async function compressImageToMax(file: File, maxBytes: number): Promise<CompressedAttachment> {
  const target = Math.max(200 * 1024, Math.floor(maxBytes * TARGET_RATIO));
  const source = await loadBitmap(file);
  try {
    const maxEdges = [1920, 1600, 1280, 1024, 800, 640, 480, 360, 240];
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
      // 이 해상도에서 목표 미달이면 최저 품질 결과라도 기록
      const fallback = await canvasToJpegBlob(canvas, 0.2);
      if (!smallest || fallback.size < smallest.size) smallest = fallback;
      if (fallback.size <= maxBytes) {
        return {
          blob: fallback,
          mime: "image/jpeg",
          name: toJpgName(file.name),
          compressed: true,
          bytes: fallback.size,
        };
      }
    }

    if (smallest && smallest.size <= maxBytes) {
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
 * 일반 파일(비이미지)은 1MB 이하면 그대로, 초과면 이미지로 디코딩 시도 후 실패 시 오류.
 */
export async function compressAttachmentFile(
  file: File,
  maxBytes: number,
  opts?: { preferImage?: boolean }
): Promise<CompressedAttachment> {
  const preferImage = opts?.preferImage === true;
  const looksImage = isImageLike(file);

  if (preferImage || looksImage) {
    return await compressImageToMax(file, maxBytes);
  }

  // 파일 첨부: 용량 초과면 이미지로라도 줄여보기 (갤러리 사진 등)
  if (file.size > maxBytes) {
    try {
      return await compressImageToMax(file, maxBytes);
    } catch {
      throw new Error(
        `파일은 1MB 이하여야 합니다. (${file.name || "file"}) 사진으로 찍어 첨부해 주세요.`
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
