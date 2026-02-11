# Vercel Environment Variables 설정 가이드

## 📋 Vercel에 추가할 환경 변수 목록

Vercel의 "Environment Variables" 섹션에서 아래 변수들을 추가하세요.

---

## 1️⃣ GOOGLE_CLIENT_ID
**설명:** Google OAuth 클라이언트 ID  
**값:** 로컬 `.env.local` 파일의 `GOOGLE_CLIENT_ID` 값과 동일하게 복사  
**예시 형식:** `123456789-abcdefghijklmnop.apps.googleusercontent.com`

**확인 방법:**
- 프로젝트 폴더에서 `.env.local` 파일 열기
- `GOOGLE_CLIENT_ID=` 뒤의 값을 복사

---

## 2️⃣ GOOGLE_CLIENT_SECRET
**설명:** Google OAuth 클라이언트 시크릿  
**값:** 로컬 `.env.local` 파일의 `GOOGLE_CLIENT_SECRET` 값과 동일하게 복사  
**예시 형식:** `GOCSPX-abcdefghijklmnopqrstuvwxyz123456`

**확인 방법:**
- 프로젝트 폴더에서 `.env.local` 파일 열기
- `GOOGLE_CLIENT_SECRET=` 뒤의 값을 복사

---

## 3️⃣ NEXTAUTH_SECRET
**설명:** NextAuth 세션 암호화용 비밀키  
**값:** 로컬 `.env.local` 파일의 `NEXTAUTH_SECRET` 값과 동일하게 복사  
**예시 형식:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6` (길게, 랜덤 문자열)

**확인 방법:**
- 프로젝트 폴더에서 `.env.local` 파일 열기
- `NEXTAUTH_SECRET=` 뒤의 값을 복사

---

## 4️⃣ NEXTAUTH_URL
**설명:** NextAuth 리디렉션 URL  
**값:** **지금은 비워두기** (배포 완료 후 실제 도메인 주소로 설정)  
**나중에 설정할 값:** `https://interior-erp-v2-xxx.vercel.app` (배포 후 나온 주소)

**지금 할 일:** 
- Name: `NEXTAUTH_URL`
- Value: **(비워두기 또는 아무 값이나 입력 - 나중에 수정)**

---

## 5️⃣ POSTGRES_URL (선택사항)
**설명:** Neon 데이터베이스 연결 문자열  
**값:** 
- **방법 1:** Vercel → Storage → Neon DB 생성 → 자동으로 환경 변수 추가됨
- **방법 2:** Neon Console에서 직접 생성 후 연결 문자열 복사

**지금 할 일:**
- **일단 건너뛰기** (배포 성공 후 데이터베이스 연결)
- 또는 Vercel → Storage → Create Database → Neon 선택

**예시 형식:** `postgres://user:password@host.neon.tech/dbname?sslmode=require`

---

## ✅ 체크리스트

Vercel Environment Variables에 추가:
- [ ] `GOOGLE_CLIENT_ID` = (로컬 .env.local에서 복사)
- [ ] `GOOGLE_CLIENT_SECRET` = (로컬 .env.local에서 복사)
- [ ] `NEXTAUTH_SECRET` = (로컬 .env.local에서 복사)
- [ ] `NEXTAUTH_URL` = (비워두기)
- [ ] `POSTGRES_URL` = (선택사항, 나중에 추가 가능)

---

## 🔍 로컬 .env.local 파일 확인 방법

1. Cursor에서 프로젝트 폴더 열기
2. `.env.local` 파일 열기 (숨김 파일일 수 있음)
3. 각 변수의 값을 복사해서 Vercel에 붙여넣기

**주의:** `.env.local` 파일은 보안상 Git에 올라가지 않습니다. 직접 복사해야 합니다.
