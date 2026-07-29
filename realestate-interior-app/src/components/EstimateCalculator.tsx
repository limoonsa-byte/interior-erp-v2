"use client";

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { interiorStyles, estimateCost } from "@/data/styles";

export function EstimateCalculator({
  defaultPyung = 30,
  defaultStyleId = "modern",
}: {
  defaultPyung?: number;
  defaultStyleId?: string;
}) {
  const [pyung, setPyung] = useState(defaultPyung);
  const [styleId, setStyleId] = useState(defaultStyleId);

  const total = useMemo(() => estimateCost(pyung, styleId), [pyung, styleId]);
  const style = interiorStyles.find((s) => s.id === styleId);

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Calculator className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-stone-900">빠른 인테리어 견적</h2>
          <p className="text-sm text-stone-500">평수와 스타일만 고르면 예상 비용이 계산됩니다</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-stone-700">평수</span>
          <input
            type="number"
            min={10}
            max={120}
            value={pyung}
            onChange={(e) => setPyung(Number(e.target.value) || 0)}
            className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none ring-stone-900 focus:ring-2"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-stone-700">스타일</span>
          <select
            value={styleId}
            onChange={(e) => setStyleId(e.target.value)}
            className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none ring-stone-900 focus:ring-2"
          >
            {interiorStyles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 rounded-2xl bg-stone-900 p-5 text-white">
        <p className="text-sm text-white/70">예상 시공비 (자재·시공 포함 참고가)</p>
        <p className="mt-2 text-3xl font-bold tracking-tight">
          {total.toLocaleString()}만 원
        </p>
        <p className="mt-2 text-sm text-white/70">
          {style?.name} · 평당 {style?.pricePerPyung}만 · 공기 {style?.periodWeeks}
        </p>
      </div>
    </div>
  );
}
