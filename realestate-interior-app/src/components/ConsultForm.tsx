"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

export function ConsultForm() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h3 className="mt-4 text-xl font-semibold text-emerald-900">상담 요청이 접수되었습니다</h3>
        <p className="mt-2 text-sm text-emerald-800">
          데모 모드입니다. 클라우드 연동 후 실제 DB/알림으로 연결할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white"
        >
          다시 작성
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-stone-700">이름</span>
          <input required name="name" className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none ring-stone-900 focus:ring-2" />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-stone-700">연락처</span>
          <input required name="phone" placeholder="010-0000-0000" className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none ring-stone-900 focus:ring-2" />
        </label>
      </div>
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-stone-700">관심 지역 / 매물</span>
        <input name="region" placeholder="예: 송파 잠실 / 판교 오피스텔" className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none ring-stone-900 focus:ring-2" />
      </label>
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-stone-700">희망 내용</span>
        <textarea
          required
          name="message"
          rows={4}
          placeholder="매물 상담, 인테리어 스타일, 예산 등을 적어주세요"
          className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none ring-stone-900 focus:ring-2"
        />
      </label>
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-stone-700 sm:w-auto"
      >
        <Send className="h-4 w-4" />
        상담 예약하기
      </button>
    </form>
  );
}
