export type LaborPayAttachmentKind = "photo" | "file";

export type LaborPayAttachmentStored = {
  kind: LaborPayAttachmentKind;
  name: string;
  mime: string;
  data: string; // base64 (no data: prefix)
};

export type LaborPayAttachmentMeta = {
  kind: LaborPayAttachmentKind;
  name: string;
  mime: string;
  index: number;
};

export const LABOR_PAY_MAX_PHOTOS = 3;
export const LABOR_PAY_MAX_FILES = 1;
export const LABOR_PAY_MAX_BYTES = 1024 * 1024; // 1MB each

const PHOTO_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);

function stripDataUrl(data: string): string {
  const s = String(data ?? "").trim();
  const m = /^data:[^;]+;base64,(.+)$/i.exec(s);
  return m ? m[1] : s.replace(/\s+/g, "");
}

function approxBytesFromBase64(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

export function parseAttachmentsJson(raw: unknown): LaborPayAttachmentStored[] {
  if (raw == null || raw === "") return [];
  try {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const kind = o.kind === "file" ? "file" : o.kind === "photo" ? "photo" : null;
        const name = String(o.name ?? "").trim() || "attachment";
        const mime = String(o.mime ?? "").trim().toLowerCase() || "application/octet-stream";
        const data = stripDataUrl(String(o.data ?? ""));
        if (!kind || !data) return null;
        return { kind, name, mime, data } as LaborPayAttachmentStored;
      })
      .filter((x): x is LaborPayAttachmentStored => x != null);
  } catch {
    return [];
  }
}

export function attachmentsToMeta(list: LaborPayAttachmentStored[]): LaborPayAttachmentMeta[] {
  return list.map((a, index) => ({
    kind: a.kind,
    name: a.name,
    mime: a.mime,
    index,
  }));
}

/** 공개/회사 제출 payload 검증 후 저장용 배열 반환 */
export function normalizeSubmitAttachments(raw: unknown): {
  ok: true;
  attachments: LaborPayAttachmentStored[];
} | { ok: false; error: string } {
  if (raw == null) return { ok: true, attachments: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "첨부 형식이 올바르지 않습니다." };

  const photos: LaborPayAttachmentStored[] = [];
  const files: LaborPayAttachmentStored[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kindRaw = String(o.kind ?? "").trim();
    const kind: LaborPayAttachmentKind | null =
      kindRaw === "photo" ? "photo" : kindRaw === "file" ? "file" : null;
    if (!kind) return { ok: false, error: "첨부 종류가 올바르지 않습니다." };

    const name = String(o.name ?? "").trim().slice(0, 200) || (kind === "photo" ? "photo.jpg" : "file");
    let mime = String(o.mime ?? "").trim().toLowerCase();
    const data = stripDataUrl(String(o.data ?? ""));
    if (!data) return { ok: false, error: "첨부 데이터가 비어 있습니다." };

    const bytes = approxBytesFromBase64(data);
    if (bytes > LABOR_PAY_MAX_BYTES) {
      return { ok: false, error: `첨부 파일은 개당 최대 1MB까지 가능합니다. (${name})` };
    }

    if (kind === "photo") {
      if (!mime) mime = "image/jpeg";
      if (!PHOTO_MIMES.has(mime) && !mime.startsWith("image/")) {
        return { ok: false, error: "사진은 이미지 파일만 첨부할 수 있습니다." };
      }
      photos.push({ kind, name, mime, data });
    } else {
      if (!mime) mime = "application/octet-stream";
      files.push({ kind, name, mime, data });
    }
  }

  if (photos.length > LABOR_PAY_MAX_PHOTOS) {
    return { ok: false, error: `사진은 최대 ${LABOR_PAY_MAX_PHOTOS}장까지 첨부할 수 있습니다.` };
  }
  if (files.length > LABOR_PAY_MAX_FILES) {
    return { ok: false, error: `파일은 최대 ${LABOR_PAY_MAX_FILES}개까지 첨부할 수 있습니다.` };
  }

  return { ok: true, attachments: [...photos, ...files] };
}
