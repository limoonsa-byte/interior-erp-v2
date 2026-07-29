import { StyleCard } from "@/components/StyleCard";
import { interiorStyles } from "@/data/styles";

export default function StylesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-stone-900">인테리어 스타일</h1>
      <p className="mt-2 text-stone-500">매물 구조와 취향에 맞는 시공 패키지를 선택하세요.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {interiorStyles.map((style) => (
          <StyleCard key={style.id} style={style} />
        ))}
      </div>
    </div>
  );
}
