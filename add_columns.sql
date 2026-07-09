-- 채점 내역(cta_grading_attempt) 테이블 컬럼 추가 SQL
-- 이 스크립트는 사용자의 채점 상세 내역을 보관할 수 있도록 테이블을 확장합니다.

-- 1. cta_problem 테이블에 대한 외래키 관계를 담는 problem_id 컬럼 추가
ALTER TABLE cta_grading_attempt 
ADD COLUMN problem_id INTEGER REFERENCES cta_problem(id);

-- 2. 수험생이 작성하여 제출한 답안의 JSON 구조(배열 형태 등)를 저장할 answers_json 컬럼 추가
ALTER TABLE cta_grading_attempt 
ADD COLUMN answers_json JSONB;

-- 3. AI(Gemini)가 체점하여 산출해낸 결과(점수, 루브릭 충족도, 피드백 등)를 저장할 result_json 컬럼 추가
ALTER TABLE cta_grading_attempt 
ADD COLUMN result_json JSONB;
