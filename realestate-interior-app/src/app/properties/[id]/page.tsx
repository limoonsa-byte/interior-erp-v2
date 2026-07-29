import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bath, BedDouble, MapPin, Maximize } from "lucide-react";
import { formatPrice, getProperty } from "@/data/properties";
import { getStyle } from "@/data/styles";
import { EstimateCalculator } from "@/components/EstimateCalculator";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = getProperty(id);
  if (!property) notFound();

  const styles = property.interiorStyleIds.map((sid) => getStyle(sid)).filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className={`rounded-[2rem] bg-gradient-to-br ${property.gradient} p-8 text-white sm:p-10`}>
        <p className="text-sm text-white/80">{property.type} · {property.region}</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{property.title}</h1>
        <p className="mt-4 flex items-center gap-2 text-white/85">
          <MapPin className="h-4 w-4" />
          {property.address}
        </p>
        <p className="mt-6 text-3xl font-bold">{formatPrice(property)}</p>
        <p className="mt-2 text-amber-100">{property.highlight}</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-semibold">매물 정보</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Info icon={<Maximize className="h-4 w-4" />} label="평수" value={`${property.pyung}평`} />
              <Info icon={<BedDouble className="h-4 w-4" />} label="방" value={`${property.rooms}개`} />
              <Info icon={<Bath className="h-4 w-4" />} label="욕실" value={`${property.baths}개`} />
              <Info label="층수" value={property.floor} />
              <Info label="준공" value={`${property.year}년`} />
            </div>
            <p className="mt-5 leading-relaxed text-stone-600">{property.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {property.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
                  #{tag}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-semibold">추천 인테리어</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {styles.map((style) =>
                style ? (
                  <Link
                    key={style.id}
                    href={`/styles/${style.id}`}
                    className={`rounded-2xl bg-gradient-to-br ${style.gradient} p-4 text-white`}
                  >
                    <p className="text-xs text-white/70">{style.nameEn}</p>
                    <p className="mt-2 text-lg font-semibold">{style.name}</p>
                    <p className="mt-1 text-sm text-white/80">평당 {style.pricePerPyung}만~</p>
                  </Link>
                ) : null,
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <EstimateCalculator
            defaultPyung={property.pyung}
            defaultStyleId={property.interiorStyleIds[0] || "modern"}
          />
          <Link
            href="/consult"
            className="block rounded-full bg-stone-900 px-5 py-3.5 text-center text-sm font-semibold text-white hover:bg-stone-700"
          >
            이 매물로 상담 예약
          </Link>
        </div>
      </div>
    </div>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <p className="flex items-center gap-1 text-xs text-stone-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-semibold text-stone-900">{value}</p>
    </div>
  );
}
