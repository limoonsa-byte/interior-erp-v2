"use client";

import { useMemo, useState } from "react";
import { PropertyCard } from "@/components/PropertyCard";
import { properties, type PropertyType } from "@/data/properties";

const types: Array<PropertyType | "전체"> = ["전체", "아파트", "오피스텔", "빌라", "주택"];

export default function PropertiesPage() {
  const [type, setType] = useState<(typeof types)[number]>("전체");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      const typeOk = type === "전체" || p.type === type;
      const query = q.trim().toLowerCase();
      const qOk =
        !query ||
        p.title.toLowerCase().includes(query) ||
        p.region.toLowerCase().includes(query) ||
        p.address.toLowerCase().includes(query);
      return typeOk && qOk;
    });
  }, [type, q]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-stone-900">매물 찾기</h1>
      <p className="mt-2 text-stone-500">지역과 타입으로 찾고, 인테리어 스타일과 함께 비교하세요.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="지역, 매물명 검색"
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none ring-stone-900 focus:ring-2 sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                type === t
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-10 text-center text-stone-500">조건에 맞는 매물이 없습니다.</p>
      )}
    </div>
  );
}
