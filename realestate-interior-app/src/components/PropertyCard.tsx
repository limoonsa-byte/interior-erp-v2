import Link from "next/link";
import { Bath, BedDouble, Maximize } from "lucide-react";
import { formatPrice, type Property } from "@/data/properties";

export function PropertyCard({ property }: { property: Property }) {
  return (
    <Link
      href={`/properties/${property.id}`}
      className="group overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className={`relative h-44 bg-gradient-to-br ${property.gradient} p-5 text-white`}>
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs backdrop-blur">
          {property.type}
        </span>
        <h3 className="mt-8 text-lg font-semibold leading-snug">{property.title}</h3>
        <p className="mt-2 text-sm text-white/85">{property.region}</p>
      </div>
      <div className="space-y-3 p-5">
        <p className="text-xl font-bold text-stone-900">{formatPrice(property)}</p>
        <p className="text-sm text-amber-700">{property.highlight}</p>
        <div className="flex flex-wrap gap-3 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1">
            <Maximize className="h-3.5 w-3.5" />
            {property.pyung}평
          </span>
          <span className="inline-flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5" />
            방 {property.rooms}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" />
            욕실 {property.baths}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {property.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
