-- 일정 목록 제목 왼쪽 표시색·캘린더 막대색 (사용자 지정, 없으면 자동)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS schedule_list_color TEXT;
