-- CTA 세법 학업 도우미 테이블 리네임 SQL
-- 이 스크립트는 기존의 테이블 이름을 cta_ 로 시작하도록 이름을 변경합니다.

-- 1. 과목 테이블 리네임
ALTER TABLE subjects RENAME TO cta_subject;

-- 2. 문제 테이블 리네임
ALTER TABLE problems RENAME TO cta_problem;

-- 3. 소문항 테이블 리네임
ALTER TABLE subquestions RENAME TO cta_subquestion;

-- 4. 채점 루브릭 테이블 리네임
ALTER TABLE subquestion_rubrics RENAME TO cta_subquestion_rubric;

-- 5. 채점 시도 기록 테이블 리네임
ALTER TABLE grading_attempts RENAME TO cta_grading_attempt;
