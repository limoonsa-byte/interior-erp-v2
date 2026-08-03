"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LABOR_PAY_MAX_BYTES,
  LABOR_PAY_MAX_FILES,
  LABOR_PAY_MAX_PHOTOS,
  type LaborPayAttachmentKind,
  type LaborPayAttachmentMeta,
} from "@/lib/laborPayAttachments";
import { blobToBase64, compressAttachmentFile } from "@/lib/compressLaborPayAttachment";

type PublicLaborPay = {
  workerName: string;
  status: string;
  amount: number | null;
  content: string | null;
  siteTitle: string;
  customerName: string;
  address: string;
  notice?: string | null;
  attachments?: LaborPayAttachmentMeta[];
};

type PendingAttachment = {
  kind: LaborPayAttachmentKind;
  name: string;
  mime: string;
  data: string;
  previewUrl?: string;
  note?: string;
};

export default function LaborPayPublicFormPage() {
  const params = useParams();
  const token = String(params?.token ?? "").trim();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<PublicLaborPay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState<PendingAttachment[]>([]);
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [submittedAttachments, setSubmittedAttachments] = useState<LaborPayAttachmentMeta[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("잘못된 링크입니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/labor-pay/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error || "링크를 불러올 수 없습니다.");
        const payload = json as PublicLaborPay;
        setData(payload);
        if (payload.status === "submitted") {
          setDone(true);
          if (payload.amount != null) setAmount(String(payload.amount));
          if (payload.content) setContent(String(payload.content));
          setSubmittedAttachments(Array.isArray(payload.attachments) ? payload.attachments : []);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, [photos, files]);

  const addFiles = async (kind: LaborPayAttachmentKind, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setCompressing(true);
    const incoming = Array.from(fileList);
    const next: PendingAttachment[] = [];
    const maxCount = kind === "photo" ? LABOR_PAY_MAX_PHOTOS : LABOR_PAY_MAX_FILES;
    const already = kind === "photo" ? photos.length : files.length;
    const room = Math.max(0, maxCount - already);
    if (room <= 0) {
      setError(
        kind === "photo"
          ? `사진은 최대 ${LABOR_PAY_MAX_PHOTOS}장까지입니다.`
          : `파일은 최대 ${LABOR_PAY_MAX_FILES}개까지입니다.`
      );
      setCompressing(false);
      return;
    }
    const toProcess = incoming.slice(0, room);

    try {
      for (const file of toProcess) {
        // 사진 칸: 무조건 1MB 이하 JPEG. 파일 칸: 이미지면 압축, 실패·비이미지는 규칙대로 처리.
        const compressed = await compressAttachmentFile(file, LABOR_PAY_MAX_BYTES, {
          forceImage: kind === "photo",
        });
        if (compressed.bytes > LABOR_PAY_MAX_BYTES) {
          throw new Error(`첨부를 1MB 이하로 만들지 못했습니다. (${compressed.name})`);
        }
        const dataB64 = await blobToBase64(compressed.blob);
        const previewUrl =
          kind === "photo" || compressed.mime.startsWith("image/")
            ? URL.createObjectURL(compressed.blob)
            : undefined;
        const kb = Math.max(1, Math.round(compressed.bytes / 1024));
        next.push({
          kind,
          name: compressed.name || (kind === "photo" ? "photo.jpg" : "file"),
          mime: compressed.mime,
          data: dataB64,
          previewUrl,
          note: compressed.compressed ? `${kb}KB로 자동 축소` : `${kb}KB`,
        });
      }

      if (incoming.length > room) {
        setError(
          kind === "photo"
            ? `사진은 최대 ${LABOR_PAY_MAX_PHOTOS}장까지라 일부만 추가했습니다.`
            : `파일은 최대 ${LABOR_PAY_MAX_FILES}개까지라 일부만 추가했습니다.`
        );
      }

      if (kind === "photo") {
        setPhotos((prev) => [...prev, ...next].slice(0, LABOR_PAY_MAX_PHOTOS));
      } else {
        setFiles((prev) => [...prev, ...next].slice(0, LABOR_PAY_MAX_FILES));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "첨부 처리에 실패했습니다.");
    } finally {
      setCompressing(false);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const attachments = [...photos, ...files].map(({ kind, name, mime, data }) => ({
        kind,
        name,
        mime,
        data,
      }));
      const res = await fetch(`/api/labor-pay/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, content, attachments }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || "제출에 실패했습니다.");
      setSubmittedAttachments(
        Array.isArray((json as { attachments?: LaborPayAttachmentMeta[] }).attachments)
          ? (json as { attachments: LaborPayAttachmentMeta[] }).attachments
          : attachments.map((a, index) => ({
              kind: a.kind,
              name: a.name,
              mime: a.mime,
              index,
            }))
      );
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 px-4 py-10">
        <p className="text-center text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-dvh bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">결제 금액 입력</h1>
        <p className="mt-1 text-sm text-gray-500">회사에서 보낸 링크입니다. 금액과 내용을 입력해 주세요.</p>

        <div className="mt-4 space-y-1 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-700">
          <div>
            <span className="text-gray-500">현장</span> · {data?.siteTitle || "-"}
          </div>
          <div>
            <span className="text-gray-500">고객</span> · {data?.customerName || "-"}
          </div>
          {data?.address ? (
            <div>
              <span className="text-gray-500">주소</span> · {data.address}
            </div>
          ) : null}
          <div>
            <span className="text-gray-500">인부</span> · {data?.workerName || "-"}
          </div>
        </div>

        {data?.notice ? (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-900 whitespace-pre-wrap">
            {data.notice}
          </div>
        ) : null}

        {done ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
            <p className="font-medium">제출이 완료되었습니다. 감사합니다.</p>
            {amount ? <p className="mt-2">금액: {Number(amount).toLocaleString("ko-KR")}원</p> : null}
            {content ? <p className="mt-1 whitespace-pre-wrap">내용: {content}</p> : null}
            {submittedAttachments.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="font-medium">첨부</p>
                <ul className="space-y-1">
                  {submittedAttachments.map((a) => (
                    <li key={`${a.kind}-${a.index}`}>
                      <a
                        href={`/api/labor-pay/${encodeURIComponent(token)}/attachment?index=${a.index}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 underline"
                      >
                        {a.kind === "photo" ? "사진" : "파일"} · {a.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">금액 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                placeholder="예: 150000"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[120px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                placeholder="작업 내용, 기간 등을 적어 주세요"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                사진 첨부 (최대 {LABOR_PAY_MAX_PHOTOS}장)
              </label>
              <p className="mb-2 text-xs text-gray-500">
                촬영·앨범 선택 즉시 <span className="font-medium text-gray-700">자동으로 1MB 이하</span>로
                줄입니다.
              </p>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={compressing || submitting || photos.length >= LABOR_PAY_MAX_PHOTOS}
                onChange={(e) => {
                  void addFiles("photo", e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <input
                ref={albumRef}
                type="file"
                accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp"
                multiple
                disabled={compressing || submitting || photos.length >= LABOR_PAY_MAX_PHOTOS}
                onChange={(e) => {
                  void addFiles("photo", e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={compressing || submitting || photos.length >= LABOR_PAY_MAX_PHOTOS}
                  onClick={() => cameraRef.current?.click()}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  카메라 촬영
                </button>
                <button
                  type="button"
                  disabled={compressing || submitting || photos.length >= LABOR_PAY_MAX_PHOTOS}
                  onClick={() => albumRef.current?.click()}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  앨범에서 선택
                </button>
              </div>
              {photos.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {photos.map((p, idx) => (
                    <div key={`${p.name}-${idx}`} className="relative overflow-hidden rounded-lg border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.previewUrl} alt={p.name} className="h-20 w-full object-cover" />
                      {p.note ? (
                        <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-0.5 text-[10px] text-white">
                          {p.note}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                파일 첨부 (최대 {LABOR_PAY_MAX_FILES}개 · 개당 1MB)
              </label>
              <p className="mb-2 text-xs text-gray-500">
                사진·이미지 파일도 여기로 넣으면 자동으로 1MB 이하로 줄입니다.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.hwp,.xls,.xlsx,.zip,.txt"
                disabled={compressing || submitting || files.length >= LABOR_PAY_MAX_FILES}
                onChange={(e) => {
                  void addFiles("file", e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                disabled={compressing || submitting || files.length >= LABOR_PAY_MAX_FILES}
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                파일 선택
              </button>
              {files.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {files.map((f, idx) => (
                    <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {f.name}
                        {f.note ? <span className="ml-1 text-xs text-gray-500">({f.note})</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((prev) => {
                            const target = prev[idx];
                            if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
                            return prev.filter((_, i) => i !== idx);
                          })
                        }
                        className="shrink-0 text-xs text-red-600"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {compressing && <p className="text-sm text-blue-600">첨부 용량 줄이는 중… (1MB 이하)</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || compressing}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "제출 중…" : "제출하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
