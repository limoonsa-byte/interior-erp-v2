import { ConsultForm } from "@/components/ConsultForm";

export default function ConsultPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-stone-900">무료 상담 예약</h1>
      <p className="mt-2 text-stone-500">
        매물 추천, 인테리어 스타일, 예산 상담을 남겨주세요. (현재는 데모 제출)
      </p>
      <div className="mt-8">
        <ConsultForm />
      </div>
    </div>
  );
}
