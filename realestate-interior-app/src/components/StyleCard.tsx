import Link from "next/link";
import { type InteriorStyle } from "@/data/styles";

export function StyleCard({ style }: { style: InteriorStyle }) {
  return (
    <Link
      href={`/styles/${style.id}`}
      className="group overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className={`h-36 bg-gradient-to-br ${style.gradient} p-5 text-white`}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">{style.nameEn}</p>
        <h3 className="mt-8 text-2xl font-semibold">{style.name}</h3>
      </div>
      <div className="space-y-3 p-5">
        <p className="text-sm leading-relaxed text-stone-600">{style.summary}</p>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-stone-900">
            평당 {style.pricePerPyung}만~
          </span>
          <span className="text-stone-500">{style.periodWeeks}</span>
        </div>
      </div>
    </Link>
  );
}
