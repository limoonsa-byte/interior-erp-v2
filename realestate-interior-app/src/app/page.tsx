import Link from "next/link";
import { ArrowRight, Home, Palette, Ruler, Sparkles } from "lucide-react";
import { PropertyCard } from "@/components/PropertyCard";
import { StyleCard } from "@/components/StyleCard";
import { properties } from "@/data/properties";
import { interiorStyles } from "@/data/styles";

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-stone-200 bg-stone-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(251,191,36,0.25),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.2),_transparent_40%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-amber-200">
              <Sparkles className="h-3.5 w-3.5" />
              클라우드 개발용 신규 프로젝트
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              집 고르기와
              <br />
              인테리어를 한 번에
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-stone-300 sm:text-lg">
              SpaceNest는 부동산 매물과 인테리어 스타일·예상 견적·상담을 연결하는
              고객용 앱입니다. 기존 ERP와 분리된 새 폴더 프로젝트입니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/properties"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-900"
              >
                매물 둘러보기 <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/estimate"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-3 text-sm font-semibold text-white"
              >
                견적 계산
              </Link>
            </div>
          </div>

          <div className="grid gap-3 self-end">
            {[
              { icon: Home, title: "매물 큐레이션", desc: "지역·평수·타입별 추천" },
              { icon: Palette, title: "스타일 매칭", desc: "매물별 어울리는 인테리어" },
              { icon: Ruler, title: "즉시 견적", desc: "평수 기반 예상 시공비" },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
              >
                <item.icon className="mt-0.5 h-5 w-5 text-amber-300" />
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-stone-300">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">추천 매물</h2>
            <p className="mt-1 text-sm text-stone-500">인테리어 시공과 함께 보기 좋은 매물</p>
          </div>
          <Link href="/properties" className="text-sm font-medium text-stone-700 hover:underline">
            전체 보기
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {properties.slice(0, 3).map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-stone-900">인테리어 스타일</h2>
              <p className="mt-1 text-sm text-stone-500">취향에 맞는 패키지를 골라보세요</p>
            </div>
            <Link href="/styles" className="text-sm font-medium text-stone-700 hover:underline">
              전체 보기
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {interiorStyles.slice(0, 3).map((style) => (
              <StyleCard key={style.id} style={style} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
