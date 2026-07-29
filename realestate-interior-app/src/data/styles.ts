export type InteriorStyle = {
  id: string;
  name: string;
  nameEn: string;
  summary: string;
  pricePerPyung: number;
  periodWeeks: string;
  colors: string[];
  materials: string[];
  bestFor: string[];
  gradient: string;
};

export const interiorStyles: InteriorStyle[] = [
  {
    id: "modern",
    name: "모던 시티",
    nameEn: "Modern City",
    summary: "깔끔한 라인과 중립 톤으로 매매·임차 모두 선호도가 높은 스타일",
    pricePerPyung: 85,
    periodWeeks: "3~5주",
    colors: ["화이트", "그레이", "블랙"],
    materials: ["포세린타일", "엔지니어드스톤", "간접조명"],
    bestFor: ["아파트", "오피스텔"],
    gradient: "from-slate-700 to-slate-900",
  },
  {
    id: "scandi",
    name: "북유럽 스칸디",
    nameEn: "Scandinavian",
    summary: "밝은 우드와 패브릭으로 따뜻한 주거 감성을 만드는 스타일",
    pricePerPyung: 78,
    periodWeeks: "3~4주",
    colors: ["아이보리", "오크", "세이지"],
    materials: ["원목마루", "패브릭커튼", "무광도어"],
    bestFor: ["아파트", "빌라"],
    gradient: "from-stone-400 to-amber-700",
  },
  {
    id: "minimal",
    name: "미니멀 라이프",
    nameEn: "Minimal Life",
    summary: "히든 수납과 절제된 마감으로 작은 평수를 넓게 보이게 합니다",
    pricePerPyung: 72,
    periodWeeks: "2~4주",
    colors: ["화이트", "베이지", "라이트그레이"],
    materials: ["히든핸들", "붙박이장", "슬림조명"],
    bestFor: ["오피스텔", "소형아파트"],
    gradient: "from-zinc-300 to-zinc-600",
  },
  {
    id: "japandi",
    name: "자판디",
    nameEn: "Japandi",
    summary: "일본식 절제미와 북유럽 따뜻함을 섞은 요즘 트렌드 스타일",
    pricePerPyung: 92,
    periodWeeks: "4~6주",
    colors: ["샌드", "차콜", "월넛"],
    materials: ["라탄", "무절목재", "흙톤페인트"],
    bestFor: ["빌라", "주택"],
    gradient: "from-yellow-700 to-stone-800",
  },
  {
    id: "classic",
    name: "클래식 프리미엄",
    nameEn: "Classic Premium",
    summary: "몰딩·헤링본·고급 마감으로 품격 있는 패밀리 공간을 연출합니다",
    pricePerPyung: 110,
    periodWeeks: "5~8주",
    colors: ["크림", "네이비", "골드"],
    materials: ["헤링본마루", "아트월", "수입타일"],
    bestFor: ["대형아파트", "주택"],
    gradient: "from-indigo-800 to-amber-700",
  },
  {
    id: "coastal",
    name: "코스탈 브리즈",
    nameEn: "Coastal Breeze",
    summary: "바다·자연광을 살리는 청량한 톤의 리조트형 인테리어",
    pricePerPyung: 88,
    periodWeeks: "3~5주",
    colors: ["스카이", "화이트", "샌드"],
    materials: ["포세린", "린넨커튼", "미러장"],
    bestFor: ["오션뷰", "오피스텔"],
    gradient: "from-sky-400 to-blue-700",
  },
];

export function getStyle(id: string) {
  return interiorStyles.find((s) => s.id === id);
}

export function estimateCost(pyung: number, styleId: string) {
  const style = getStyle(styleId);
  if (!style) return 0;
  return Math.round(pyung * style.pricePerPyung);
}
