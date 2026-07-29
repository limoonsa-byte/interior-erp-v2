const cases = [
  {
    title: "잠실 34평 · 모던 시티",
    before: "노후 장판·분리형 주방",
    after: "오픈형 거실·간접조명·중문",
    period: "4주",
    cost: "2,850만",
    tone: "from-sky-500 to-indigo-600",
  },
  {
    title: "연남 빌라 · 자판디",
    before: "좁은 복층 수납 부족",
    after: "히든 수납·우드톤 마감",
    period: "5주",
    cost: "2,100만",
    tone: "from-yellow-700 to-stone-800",
  },
  {
    title: "위례 42평 · 클래식 프리미엄",
    before: "기본 도배·타일",
    after: "헤링본·아트월·키친 고급화",
    period: "7주",
    cost: "4,350만",
    tone: "from-indigo-800 to-amber-700",
  },
  {
    title: "해운대 오피스텔 · 코스탈",
    before: "어두운 기본 마감",
    after: "밝은 톤·뷰 강조 커튼·미러장",
    period: "3주",
    cost: "1,650만",
    tone: "from-sky-400 to-blue-700",
  },
];

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-stone-900">시공 사례</h1>
      <p className="mt-2 text-stone-500">Before / After 중심으로 정리한 데모 포트폴리오입니다.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {cases.map((item) => (
          <article
            key={item.title}
            className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"
          >
            <div className={`bg-gradient-to-br ${item.tone} p-6 text-white`}>
              <h2 className="text-xl font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-white/80">
                {item.period} · {item.cost}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 text-sm">
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Before</p>
                <p className="mt-2 text-stone-700">{item.before}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">After</p>
                <p className="mt-2 text-stone-800">{item.after}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
