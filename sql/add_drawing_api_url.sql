-- 회사별 도면 보관함 API URL 저장
ALTER TABLE companies ADD COLUMN IF NOT EXISTS drawing_list_api_url TEXT;
