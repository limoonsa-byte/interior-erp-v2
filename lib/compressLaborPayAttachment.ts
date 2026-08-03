/** 브라우저에서 첨부 파일을 1MB 이하로 자동 축소 (이미지: 리사이즈+JPEG 압축) */

export type CompressedAttachment = {
  blob: Blob;
  mime: string;
  name: string;
  compressed: boolean;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 불러오지 못했습니다. 다른 형식으로 다시 찍어 주세요."));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
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

function drawScaled(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0, 1));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 압축을 지원하지 않는 환경입니다.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function toJpgName(name: string): string {
  const base = (name || "photo").replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

async function compressImageFile(file: File, maxBytes: number): Promise<CompressedAttachment> {
  if (file.size <= maxBytes && (file.type === "image/jpeg" || file.type === "image/jpg")) {
    return { blob: file, mime: "image/jpeg", name: file.name || "photo.jpg", compressed: false };
  }

  const img = await loadImageFromFile(file);
  const maxEdges = [2048, 1600, 1280, 1024, 800, 640, 480];
  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.28];

  let best: Blob | null = null;
  for (const edge of maxEdges) {
    const canvas = drawScaled(img, edge);
    for (const q of qualities) {
      const blob = await canvasToJpegBlob(canvas, q);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= maxBytes) {
        return {
          blob,
          mime: "image/jpeg",
          name: toJpgName(file.name),
          compressed: true,
        };
      }
    }
  }

  if (best && best.size <= maxBytes) {
    return { blob: best, mime: "image/jpeg", name: toJpgName(file.name), compressed: true };
  }

  throw new Error(
    `사진을 1MB 이하로 줄이지 못했습니다. (${file.name || "photo"}) 화면을 조금 더 멀리서 다시 찍어 주세요.`
  );
}

/**
 * 사진/이미지 파일은 자동으로 1MB 이하 JPEG로 줄인다.
 * 이미지가 아닌 일반 파일은 1MB 이하면 그대로, 초과하면 오류.
 */
export async function compressAttachmentFile(
  file: File,
  maxBytes: number,
  opts?: { preferImage?: boolean }
): Promise<CompressedAttachment> {
  const isImage =
    (file.type && file.type.startsWith("image/")) ||
    /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name || "");

  if (isImage || opts?.preferImage) {
    try {
      return await compressImageFile(file, maxBytes);
    } catch (e) {
      // HEIC 등 디코드 실패 시, 이미 1MB 이하면 원본 전송
      if (file.size <= maxBytes) {
        return {
          blob: file,
          mime: file.type || "application/octet-stream",
          name: file.name || "file",
          compressed: false,
        };
      }
      throw e;
    }
  }

  if (file.size <= maxBytes) {
    return {
      blob: file,
      mime: file.type || "application/octet-stream",
      name: file.name || "file",
      compressed: false,
    };
  }

  throw new Error(
    `파일은 1MB 이하여야 합니다. (${file.name || "file"}) 용량을 줄이거나 이미지로 찍어 첨부해 주세요.`
  );
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
