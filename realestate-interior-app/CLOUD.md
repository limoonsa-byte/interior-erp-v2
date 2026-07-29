# Cursor Cloud 연결 가이드

이 폴더(`realestate-interior-app`)는 기존 ERP와 분리된 **부동산 × 인테리어** 신규 앱입니다.

## 1. GitHub에 푸시된 상태 확인

저장소: `limoonsa-byte/interior-erp-v2`  
경로: `/realestate-interior-app`

## 2. Cursor Cloud에서 작업

1. Cursor에서 해당 GitHub 저장소 열기
2. Cloud Agent / Background Agent 시작
3. 프롬프트 예:
   - `realestate-interior-app 폴더에서 작업해줘`
   - `매물 API를 Postgres에 연동해줘`
   - `Vercel에 realestate-interior-app 배포 설정해줘`

## 3. 로컬/클라우드 실행

```bash
cd realestate-interior-app
npm install
npm run dev
```

## 4. 별도 저장소로 분리하고 싶을 때

나중에 독립 레포가 필요하면 이 폴더만 새 GitHub repo로 옮기면 됩니다.
지금은 같은 저장소 안에서 클라우드 에이전트가 바로 작업할 수 있습니다.
