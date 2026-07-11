-- ============================================================
-- CTA 신규 기능 마이그레이션: 힌트·정답보기·오답노트·학습통계
-- 실행 위치: Supabase SQL Editor
-- ============================================================

-- [1] cta_grading_attempt 확장
ALTER TABLE cta_grading_attempt
  ADD COLUMN IF NOT EXISTS is_saved_note  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_saved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hint_used      BOOLEAN      NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_grading_attempt_user_note
  ON cta_grading_attempt (user_id, is_saved_note, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grading_attempt_stats
  ON cta_grading_attempt (user_id, hint_used, created_at DESC);

-- [2] cta_feature_log 신규 테이블
CREATE TABLE IF NOT EXISTS cta_feature_log (
  id             BIGSERIAL     PRIMARY KEY,
  user_id        UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id     INT           NOT NULL REFERENCES cta_problem(id) ON DELETE CASCADE,
  subquestion_id INT           NOT NULL REFERENCES cta_subquestion(id) ON DELETE CASCADE,
  feature_type   TEXT          NOT NULL CHECK (feature_type IN ('hint', 'answer')),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_log_user_date
  ON cta_feature_log (user_id, feature_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_log_hint_check
  ON cta_feature_log (user_id, problem_id, subquestion_id, feature_type);

CREATE INDEX IF NOT EXISTS idx_feature_log_problem_user
  ON cta_feature_log (user_id, problem_id);

-- [3] RLS
ALTER TABLE cta_feature_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_log_select_own" ON cta_feature_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "feature_log_insert_own" ON cta_feature_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- [4] 통계 뷰
CREATE OR REPLACE VIEW v_grading_stats AS
SELECT
  ga.user_id,
  cp.subject_id,
  DATE_TRUNC('day', ga.created_at AT TIME ZONE 'Asia/Seoul') AS attempt_date,
  ga.id AS attempt_id,
  (ga.result_json->>'totalScore')::NUMERIC  AS total_score_awarded,
  cp.total_score                             AS total_score_max
FROM cta_grading_attempt ga
JOIN cta_problem cp ON cp.id = ga.problem_id
WHERE ga.result_json IS NOT NULL
  AND ga.hint_used = false;
