export type PropertyType = "아파트" | "오피스텔" | "빌라" | "주택";

export type Property = {
  id: string;
  title: string;
  type: PropertyType;
  region: string;
  address: string;
  price: number;
  deposit?: number;
  monthly?: number;
  pyung: number;
  rooms: number;
  baths: number;
  floor: string;
  year: number;
  tags: string[];
  interiorStyleIds: string[];
  description: string;
  highlight: string;
  gradient: string;
};

export const properties: Property[] = [
  {
    id: "p1",
    title: "잠실 리버뷰 34평 리모델링 추천",
    type: "아파트",
    region: "서울 송파",
    address: "서울시 송파구 잠실동",
    price: 185000,
    pyung: 34,
    rooms: 3,
    baths: 2,
    floor: "15/25층",
    year: 2008,
    tags: ["한강뷰", "학군우수", "풀옵션"],
    interiorStyleIds: ["modern", "scandi"],
    description:
      "한강이 보이는 남향 매물입니다. 거실·주방 오픈형 인테리어와 중문 시공에 최적화된 구조입니다.",
    highlight: "인테리어 포함 예상 2,800만~",
    gradient: "from-sky-500 to-indigo-600",
  },
  {
    id: "p2",
    title: "판교 테크노밸리 인근 신축 오피스텔",
    type: "오피스텔",
    region: "경기 성남",
    address: "경기도 성남시 분당구 판교동",
    price: 0,
    deposit: 1000,
    monthly: 95,
    pyung: 18,
    rooms: 1,
    baths: 1,
    floor: "8/18층",
    year: 2023,
    tags: ["신축", "역세권", "직장인추천"],
    interiorStyleIds: ["minimal", "modern"],
    description:
      "1인 가구·신혼 부부에게 인기 있는 컴팩트 평면입니다. 붙박이장·간접조명 패키지로 바로 입주 가능합니다.",
    highlight: "스타일 패키지 990만~",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    id: "p3",
    title: "마포 연남 감성 빌라 복층",
    type: "빌라",
    region: "서울 마포",
    address: "서울시 마포구 연남동",
    price: 78000,
    pyung: 28,
    rooms: 2,
    baths: 1,
    floor: "3/4층",
    year: 2015,
    tags: ["복층", "카페거리", "감성인테리어"],
    interiorStyleIds: ["japandi", "scandi"],
    description:
      "연남동 감성 상권이 가까운 복층 빌라입니다. 우드톤 자재와 히든 수납으로 공간 활용도를 높일 수 있습니다.",
    highlight: "Before/After 시공 가능",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    id: "p4",
    title: "위례 신도시 42평 패밀리 하우스",
    type: "아파트",
    region: "경기 성남",
    address: "경기도 성남시 수정구 창곡동",
    price: 142000,
    pyung: 42,
    rooms: 4,
    baths: 2,
    floor: "7/15층",
    year: 2017,
    tags: ["패밀리", "대형평수", "수납특화"],
    interiorStyleIds: ["classic", "modern"],
    description:
      "아이 방·홈오피스 구성이 쉬운 대형 평면입니다. 키친·욕실 고급 마감 견적 템플릿이 준비되어 있습니다.",
    highlight: "패밀리 패키지 4,200만~",
    gradient: "from-violet-500 to-fuchsia-600",
  },
  {
    id: "p5",
    title: "해운대 오션뷰 주거용 오피스텔",
    type: "오피스텔",
    region: "부산 해운대",
    address: "부산시 해운대구 우동",
    price: 62000,
    pyung: 22,
    rooms: 2,
    baths: 1,
    floor: "22/35층",
    year: 2019,
    tags: ["오션뷰", "투자겸용", "풀옵션"],
    interiorStyleIds: ["coastal", "minimal"],
    description:
      "바다 전망을 살리는 밝은 톤 인테리어가 잘 어울립니다. 임대 수익형 마감 옵션도 함께 제안합니다.",
    highlight: "뷰 특화 인테리어",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    id: "p6",
    title: "일산 단독주택 정원형 리모델링",
    type: "주택",
    region: "경기 고양",
    address: "경기도 고양시 일산동구",
    price: 98000,
    pyung: 55,
    rooms: 5,
    baths: 3,
    floor: "지상 2층",
    year: 2005,
    tags: ["정원", "단독주택", "전체리모델링"],
    interiorStyleIds: ["classic", "japandi"],
    description:
      "노후 주택을 현대식 패밀리 하우스로 바꾸는 전체 리모델링 사례에 적합한 매물입니다.",
    highlight: "설계·시공 원스톱",
    gradient: "from-lime-500 to-green-700",
  },
];

export function formatPrice(property: Property) {
  if (property.monthly) {
    return `월세 ${property.deposit?.toLocaleString()} / ${property.monthly}`;
  }
  if (property.price >= 10000) {
    const eok = Math.floor(property.price / 10000);
    const man = property.price % 10000;
    return man ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`;
  }
  return `${property.price.toLocaleString()}만`;
}

export function getProperty(id: string) {
  return properties.find((p) => p.id === id);
}
