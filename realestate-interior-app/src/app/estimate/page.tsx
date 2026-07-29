import { EstimateCalculator } from "@/components/EstimateCalculator";
import Link from "next/link";

export default function EstimatePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-stone-900">인테리어 견적</h1>
      <p className="mt-2 text-stone-500">
        평수와 스타일 기준 참고 견적입니다. 실제 현장 실측 후 확정됩니다.
      </p>
      <div className="mt-8">
        <EstimateCalculator />
      </div>
      <div className="mt-6 rounded-3xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
        <p className="font-medium text-stone-800">클라우드 연동 포인트</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>견적 결과 DB 저장 / 회사별 단가표 연동</li>
          <li>상담 신청 시 견적 스냅샷 첨부</li>
          <li>기존 interior-erp와 API로 연결 가능</li>
        </ul>
        <Link href="/consult" className="mt-4 inline-block font-semibold text-stone-900 underline">
          견적 들고 상담 예약하기 →
        </Link>
      </div>
    </div>
  );
}
