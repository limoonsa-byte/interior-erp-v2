import Link from "next/link";
import { notFound } from "next/navigation";
import { getStyle } from "@/data/styles";
import { properties } from "@/data/properties";
import { EstimateCalculator } from "@/components/EstimateCalculator";
import { PropertyCard } from "@/components/PropertyCard";

export default async function StyleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const style = getStyle(id);
  if (!style) notFound();

  const matched = properties.filter((p) => p.interiorStyleIds.includes(style.id));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className={`rounded-[2rem] bg-gradient-to-br ${style.gradient} p-8 text-white sm:p-10`}>
        <p className="text-xs uppercase tracking-[0.25em] text-white/70">{style.nameEn}</p>
        <h1 className="mt-3 text-4xl font-bold">{style.name}</h1>
        <p className="mt-4 max-w-2xl text-white/85">{style.summary}</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold">스타일 디테일</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="평당 단가" value={`${style.pricePerPyung}만 원~`} />
            <Row label="예상 공기" value={style.periodWeeks} />
            <Row label="추천 컬러" value={style.colors.join(", ")} />
            <Row label="주요 자재" value={style.materials.join(", ")} />
            <Row label="잘 어울리는 매물" value={style.bestFor.join(", ")} />
          </dl>
          <Link
            href="/consult"
            className="mt-6 inline-flex rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white"
          >
            이 스타일로 상담하기
          </Link>
        </section>
        <EstimateCalculator defaultStyleId={style.id} />
      </div>

      {matched.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold">이 스타일과 잘 맞는 매물</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {matched.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 border-b border-stone-100 pb-3">
      <dt className="w-28 shrink-0 text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value}</dd>
    </div>
  );
}
