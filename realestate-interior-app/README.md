# SpaceNest — 부동산 × 인테리어 앱

기존 `interior-erp`와 **분리된 새 폴더 프로젝트**입니다.  
Cursor Cloud / GitHub에 연결해 이어서 개발할 수 있습니다.

## 폴더

```text
realestate-interior-app/
```

## 기능 (데모)

- 매물 목록 / 상세 + 필터·검색
- 인테리어 스타일 카탈로그
- 평수 기반 빠른 견적 계산기
- 시공 Before/After 사례
- 상담 예약 폼 (프론트 데모)

## 로컬 실행

```bash
cd realestate-interior-app
npm install
npm run dev
```

브라우저: [http://localhost:3000](http://localhost:3000)

## 클라우드에서 작업하기

1. 이 저장소(`interior-erp-v2`)를 Cursor Cloud에 연결
2. 작업 경로를 `realestate-interior-app` 으로 지정
3. Cloud Agent에게 예: "견적 API 추가해줘", "매물 DB 연동해줘" 요청

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드 결과 실행 |
| `npm run lint` | ESLint |

## 기술 스택

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- lucide-react
