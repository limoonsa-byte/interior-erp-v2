-- consultations 테이블에서 region 컬럼 제거 (앱에서 더 이상 사용하지 않음)
ALTER TABLE consultations DROP COLUMN IF EXISTS region;
