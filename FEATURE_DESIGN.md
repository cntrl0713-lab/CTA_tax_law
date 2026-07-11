# CTA 세법 AI 채점 시스템 — 신규 기능 전체 설계 문서

> 작성일: 2026-07-11  
> 대상: 시니어 풀스택 검토용  
> 기술 스택: Next.js 15 App Router · TypeScript · Supabase (PostgreSQL + Auth)

---

## 1. 전체 기능 구현 전략

### 1-1. 기능 목록 요약

| # | 기능 | 권한 | 일일 한도 | 선행 조건 |
|---|------|------|-----------|-----------|
| A | 힌트보기 | member 이상 | 3회 | 없음 |
| B | 정답보기 | member 이상 | 3회 | 같은 문제·물음 힌트 확인 후 |
| C | 오답노트 저장/목록/상세 | **pro 이상** | 무제한 | 채점 완료 후 |
| D | 마이페이지 학습 통계 | **pro 이상** | 무제한 | 채점 기록 존재 |
| E | AI 채점 요청 | **pro 이상 무제한** (guest 1회, member 3회) | | |

### 1-2. 핵심 설계 원칙

- **서버 이중 검증**: 권한·횟수·선행 조건은 프론트가 아닌 Route Handler에서 최종 판정
- **로그 재활용**: `cta_feature_log` 단일 테이블이 힌트·정답 두 기능의 사용 이력을 커버
- **스냅샷 방식**: 오답노트는 기존 `cta_grading_attempt` 테이블에 컬럼 추가만으로 운용, 별도 대형 테이블 없음
- **런타임 집계**: 통계는 별도 집계 테이블 없이 `cta_grading_attempt`를 쿼리 시마다 집계
- **힌트/정답 사용 시 통계 제외**: 힌트 또는 정답보기를 사용한 뒤 제출된 채점 결과는 학습 통계에 반영하지 않는다. 채점 API(`/api/grade`)가 채점 직전 해당 문제에 대한 `cta_feature_log` 이력을 확인하여 `hint_used = true` 플래그를 `cta_grading_attempt`에 기록하고, 통계 쿼리는 이 플래그를 필터링함.

---

## 2. DB 최소 확장안

### 기존 테이블 (변경 없음)

```
cta_subject          → 과목
cta_problem          → 문제
cta_subquestion      → 소문항
cta_subquestion_rubric → 채점 루브릭 (keywords_json, example_answer_text 이미 존재)
```

### 기존 테이블 최소 컬럼 추가

```sql
-- cta_grading_attempt에 오답노트 저장 여부 및 힌트 사용 여부 추가
ALTER TABLE cta_grading_attempt
  ADD COLUMN IF NOT EXISTS is_saved_note BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_saved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hint_used     BOOLEAN NOT NULL DEFAULT false;  -- ★ 통계 제외용
```

> **`hint_used` 컬럼 목적**: 해당 채점 시도 전에 같은 문제(problem_id)에 대해 힌트 또는 정답보기를 사용한 이력이 있으면 `true`로 저장. 통계 집계 쿼리는 `hint_used = false`인 레코드만 포함하여 순수 실력으로만 결과를 측정한다.

### 신규 테이블 2개

```
cta_feature_log  → 힌트보기·정답보기 사용 이력 (하루 3회 제한 + 선행 조건 검증)
cta_user         → 이미 존재 (tier 컬럼 확인 완료)
```

---

## 3. Supabase SQL 스키마 초안

```sql
-- ============================================================
-- [1] cta_grading_attempt 확장 (기존 테이블)
-- ============================================================
ALTER TABLE cta_grading_attempt
  ADD COLUMN IF NOT EXISTS is_saved_note  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_saved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hint_used      BOOLEAN      NOT NULL DEFAULT false;  -- ★ 힌트/정답 사용 여부

-- 오답노트 목록 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_grading_attempt_user_note
  ON cta_grading_attempt (user_id, is_saved_note, created_at DESC);

-- 통계 집계용 인덱스 (hint_used=false 필터 + 날짜 범위)
CREATE INDEX IF NOT EXISTS idx_grading_attempt_stats
  ON cta_grading_attempt (user_id, hint_used, created_at DESC);


-- ============================================================
-- [2] cta_feature_log — 힌트/정답 사용 이력 (신규)
-- ============================================================
CREATE TABLE IF NOT EXISTS cta_feature_log (
  id             BIGSERIAL     PRIMARY KEY,
  user_id        UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id     INT           NOT NULL REFERENCES cta_problem(id) ON DELETE CASCADE,
  subquestion_id INT           NOT NULL REFERENCES cta_subquestion(id) ON DELETE CASCADE,
  feature_type   TEXT          NOT NULL CHECK (feature_type IN ('hint', 'answer')),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 하루 3회 카운트용 인덱스
CREATE INDEX IF NOT EXISTS idx_feature_log_user_date
  ON cta_feature_log (user_id, feature_type, created_at DESC);

-- 정답보기 선행조건 확인 + grade API 내 힌트이력 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_feature_log_hint_check
  ON cta_feature_log (user_id, problem_id, subquestion_id, feature_type);

-- grade API: 채점 전 문제 단위 힌트 이력 확인용 인덱스
CREATE INDEX IF NOT EXISTS idx_feature_log_problem_user
  ON cta_feature_log (user_id, problem_id);


-- ============================================================
-- [3] 통계 집계 뷰 — hint_used=false인 순수 채점 결과만 집계
-- ============================================================
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
  AND ga.hint_used = false;   -- ★ 힌트/정답 사용 시도 제외
```

---

## 4. RLS / 권한 정책 설계

```sql
-- ============================================================
-- cta_feature_log RLS
-- ============================================================
ALTER TABLE cta_feature_log ENABLE ROW LEVEL SECURITY;

-- 본인 로그만 읽기 가능
CREATE POLICY "feature_log_select_own" ON cta_feature_log
  FOR SELECT USING (auth.uid() = user_id);

-- 본인만 삽입 가능 (실제 삽입은 service_role key 사용 Route Handler에서)
CREATE POLICY "feature_log_insert_own" ON cta_feature_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- cta_grading_attempt RLS (기존 정책 유지 + 오답노트 화면 대응)
-- ============================================================
-- 이미 RLS 설정 완료 가정; is_saved_note 컬럼 추가에 따른 정책 변경 불필요
-- (SELECT는 본인 레코드만 허용하는 기존 정책 유지)


-- ============================================================
-- 권한(tier) 확인 DB 함수 (Route Handler에서 활용)
-- ============================================================
CREATE OR REPLACE FUNCTION is_member_or_above(user_uuid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM cta_user
    WHERE id = user_uuid AND tier IN ('member', 'pro', 'admin')
  );
$$;

-- 하루 기능 사용 횟수 확인 함수 (KST 기준)
CREATE OR REPLACE FUNCTION count_feature_usage_today(
  p_user_id UUID,
  p_feature  TEXT
) RETURNS INT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COUNT(*)::INT
  FROM cta_feature_log
  WHERE user_id    = p_user_id
    AND feature_type = p_feature
    AND created_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::DATE::TIMESTAMPTZ
                       AT TIME ZONE 'Asia/Seoul';  -- KST 자정 기준
$$;
```

---

## 5. Next.js 폴더 구조 제안

```
src/
├── app/
│   ├── api/
│   │   ├── grade/route.ts              ← 기존
│   │   ├── hint/route.ts               ← 신규 (힌트보기 API)
│   │   ├── answer-reveal/route.ts      ← 신규 (정답보기 API)
│   │   ├── note/
│   │   │   ├── save/route.ts           ← 신규 (오답노트 저장)
│   │   │   └── [noteId]/route.ts       ← 신규 (오답노트 단건 삭제)
│   │   └── stats/route.ts              ← 신규 (학습 통계 조회)
│   │
│   ├── mypage/
│   │   ├── layout.tsx                  ← 신규 (마이페이지 공통 레이아웃)
│   │   ├── page.tsx                    ← 신규 (마이페이지 홈 → 통계)
│   │   ├── notes/
│   │   │   ├── page.tsx                ← 신규 (오답노트 목록)
│   │   │   └── [attemptId]/page.tsx    ← 신규 (오답노트 상세)
│   │   └── stats/page.tsx              ← 신규 (학습 통계 전용)
│   │
│   ├── problems/
│   │   ├── [problemId]/page.tsx        ← 기존 (AnswerForm 교체)
│   │   └── result/[attemptId]/page.tsx ← 기존 (오답노트 저장 버튼 추가)
│   │
│   └── ...
│
├── components/
│   ├── AnswerForm.tsx                  ← 기존 (힌트/정답 패널 추가)
│   ├── GradingResult.tsx               ← 기존
│   ├── HintPanel.tsx                   ← 신규
│   ├── AnswerRevealPanel.tsx           ← 신규
│   ├── SaveNoteButton.tsx              ← 신규 (클라이언트 컴포넌트)
│   ├── mypage/
│   │   ├── NoteList.tsx                ← 신규
│   │   ├── NoteDetail.tsx              ← 신규
│   │   ├── StatsView.tsx               ← 신규 (탭 UI 포함)
│   │   └── StatsBySubject.tsx          ← 신규
│   └── ...
│
├── lib/
│   ├── gemini/gradeProblem.ts          ← 기존
│   └── supabase/
│       ├── admin.ts                    ← 기존
│       ├── client.ts                   ← 기존
│       ├── server.ts                   ← 기존
│       └── middleware.ts               ← 기존
│
└── types/
    ├── db.ts                           ← 기존 (FeatureLog, GradingAttemptNote 추가)
    ├── grading.ts                      ← 기존
    ├── hint.ts                         ← 신규
    └── stats.ts                        ← 신규
```

---

## 6. API / Route Handler 설계

### 6-1. `POST /api/hint` — 힌트보기

**요청**

```ts
{ problemId: number; subquestionId: number }
```

**서버 검증 순서**

1. Supabase Auth → 로그인 확인
2. `cta_user.tier` → `member` 이상 확인
3. KST 기준 오늘 `hint` 사용 횟수 ≥ 3 → 403
4. `cta_subquestion_rubric`에서 해당 subquestionId의 `keywords_json` 조회
5. `cta_feature_log` INSERT (hint 기록)
6. keywords 배열 반환

**응답**

```ts
{
  keywords: string[]      // keywords_json에서 추출한 핵심 키워드 배열
  remainingToday: number  // 오늘 남은 힌트 횟수
}
```

---

### 6-2. `POST /api/answer-reveal` — 정답보기

**요청**

```ts
{ problemId: number; subquestionId: number }
```

**서버 검증 순서**

1. Auth → 로그인 확인
2. `cta_user.tier` → `member` 이상 확인
3. KST 기준 `answer` 사용 횟수 ≥ 3 → 403
4. **선행조건**: 오늘 또는 현 세션에서 동일 `(user_id, problem_id, subquestion_id, feature_type='hint')` 레코드 존재 확인 → 없으면 403
5. `cta_subquestion_rubric`에서 `example_answer_text` 조회
6. `cta_feature_log` INSERT (answer 기록)
7. 정답 데이터 반환

**응답**

```ts
{
  rubrics: {
    criterionName: string
    exampleAnswerText: string | null
  }[]
  remainingToday: number
}
```

---

### 6-3. `POST /api/note/save` — 오답노트 저장

**요청**

```ts
{ attemptId: string }
```

**서버 검증**

1. Auth → 로그인 확인
2. `cta_user.tier` → **`pro` 또는 `admin`** 확인 (member 불가)
3. `cta_grading_attempt.user_id === auth.uid()` 확인
4. `is_saved_note = true`, `note_saved_at = NOW()` UPDATE

**응답**

```ts
{ success: true; savedAt: string }
```

> 비회원·member 등급이 `/api/note/save`를 직접 호출하면 **403** 반환.

---

### 6-4. `GET /api/stats` — 학습 통계

**요청 (Query String)**

```
?period=weekly|monthly|all&subjectId=optional
```

**서버 처리**

1. Auth → 로그인 확인
2. `cta_user.tier` → **`pro` 또는 `admin`** 확인 (member 불가, 403 반환)
3. 기간 필터 계산 (KST 기준)
4. `cta_grading_attempt JOIN cta_problem` 집계 쿼리 — **`hint_used = false` 필터 필수**
5. 전체 + subject별 분류 후 반환

**응답**

```ts
{
  period: 'weekly' | 'monthly' | 'all'
  overall: { awardedSum: number; maxSum: number; ratio: number; count: number }
  bySubject: {
    subjectId: number
    subjectName: string
    awardedSum: number
    maxSum: number
    ratio: number
    count: number
  }[]
}
```

---

## 7. 주요 타입 정의

### `src/types/db.ts` 추가 항목

```ts
/** 기능 사용 이력 */
export interface FeatureLog {
  id: number
  user_id: string
  problem_id: number
  subquestion_id: number
  feature_type: 'hint' | 'answer'
  created_at: string
}

/** 오답노트로 저장된 채점 이력 */
export interface GradingAttemptNote {
  id: string
  user_id: string
  problem_id: number
  answers_json: { subquestionNumber: number; answerText: string }[]
  result_json: {
    totalScore: number
    maxScore?: number
    subquestions: {
      number: number
      awardedScore: number
      maxScore: number
      feedback: string
      rubricResults: { criterionName: string; awardedScore: number; maxScore: number; status: string }[]
    }[]
    overallComment: string
  }
  is_saved_note: boolean
  note_saved_at: string | null
  created_at: string
  // JOIN
  cta_problem?: {
    id: number
    title: string
    total_score: number
    subject_id: number
    cta_subject?: { name: string }
  }
}
```

### `src/types/hint.ts`

```ts
export interface HintRequest {
  problemId: number
  subquestionId: number
}

export interface HintResponse {
  keywords: string[]
  remainingToday: number
}

export interface AnswerRevealRequest {
  problemId: number
  subquestionId: number
}

export interface AnswerRevealResponse {
  rubrics: {
    criterionName: string
    exampleAnswerText: string | null
  }[]
  remainingToday: number
}
```

### `src/types/stats.ts`

```ts
export type StatsPeriod = 'weekly' | 'monthly' | 'all'

export interface SubjectStats {
  subjectId: number
  subjectName: string
  awardedSum: number
  maxSum: number
  ratio: number        // awardedSum / maxSum (NaN 방지: maxSum=0 → 0)
  count: number        // 시도 횟수
}

export interface StatsResponse {
  period: StatsPeriod
  overall: SubjectStats & { subjectId: -1; subjectName: '전체' }
  bySubject: SubjectStats[]
}
```

---

## 8. 문제 풀이 화면 UI 수정안

### `src/components/AnswerForm.tsx` 변경 요약

```
기존:  [채점하기] 버튼만 존재
변경:  [채점하기]  [힌트보기 / 정답보기(disabled→enabled)] 버튼 추가
       ↓ 클릭 시
       물음별 토글 패널 (HintPanel / AnswerRevealPanel) 표시
```

#### 상태 관리 추가

```ts
// 힌트 확인 여부 (subquestionId→boolean)
const [hintUsed, setHintUsed] = useState<Record<number, boolean>>({})
// 힌트 응답 데이터 (subquestionId→keywords)
const [hintData, setHintData] = useState<Record<number, string[]>>({})
// 정답 응답 데이터 (subquestionId→rubrics)
const [answerData, setAnswerData] = useState<Record<number, AnswerRevealResponse['rubrics']>>({})
// 패널 열림 상태 (subquestionId→'hint'|'answer'|null)
const [openPanel, setOpenPanel] = useState<Record<number, 'hint' | 'answer' | null>>({})
// 힌트보기 vs 정답보기 단계 (전체 1개 버튼)
const [featureStage, setFeatureStage] = useState<'hint' | 'answer'>('hint')
```

#### 버튼 배치

```tsx
{/* 하단 액션 영역 */}
<div className="submit-area">
  <button onClick={handleSubmit} disabled={loading} className="btn btn-primary btn-lg">
    {loading ? '채점 중...' : '🎯 채점하기'}
  </button>

  {featureStage === 'hint' ? (
    <button onClick={handleHintClick} className="btn btn-secondary btn-lg">
      💡 힌트보기
    </button>
  ) : (
    <button
      onClick={handleAnswerRevealClick}
      disabled={Object.keys(hintUsed).length === 0}
      title={Object.keys(hintUsed).length === 0 ? '힌트 확인 후 이용 가능' : ''}
      className="btn btn-outline btn-lg"
    >
      🔍 정답보기
    </button>
  )}
</div>
```

#### 물음별 힌트 패널 (HintPanel)

```tsx
// 힌트보기 버튼 클릭 → 물음 목록이 토글로 표시됨
{showHintPanel && (
  <div className="hint-panel">
    <h3>💡 물음별 힌트 (키워드)</h3>
    {problem.cta_subquestion.map((sq) => (
      <details key={sq.id}>
        <summary
          onClick={() => handleFetchHint(sq.id, sq.number)}
        >
          물음 {sq.number}
        </summary>
        {hintData[sq.id] && (
          <div className="hint-keywords">
            {hintData[sq.id].map((kw, i) => (
              <span key={i} className="badge">{kw}</span>
            ))}
          </div>
        )}
      </details>
    ))}
  </div>
)}
```

---

## 9. 채점결과 화면 — 오답노트 저장 기능

### `src/app/problems/result/[attemptId]/page.tsx` 수정

하단 버튼 영역에 `SaveNoteButton` 클라이언트 컴포넌트 추가.

```tsx
// 하단 제어 버튼
<div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px', gap: '15px' }}>
  <Link href="/" className="btn btn-secondary">목록으로 돌아가기</Link>
  
  {/* 신규: 오답노트 저장 버튼 */}
  <SaveNoteButton
    attemptId={attemptId}
    initialSaved={attempt.is_saved_note}
  />
</div>
```

### `src/components/SaveNoteButton.tsx`

```tsx
'use client'

import { useState } from 'react'

interface Props {
  attemptId: string
  initialSaved: boolean
}

export default function SaveNoteButton({ attemptId, initialSaved }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (saved) return
    setLoading(true)
    try {
      const res = await fetch('/api/note/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setLoading(false)
    }
  }

  if (saved) {
    return (
      <span className="btn btn-success" style={{ cursor: 'default' }}>
        ✅ 오답노트 저장됨
      </span>
    )
  }

  return (
    <button
      className="btn btn-primary"
      onClick={handleSave}
      disabled={loading}
    >
      {loading ? '저장 중...' : '📝 오답노트 저장'}
    </button>
  )
}
```

---

## 10. 마이페이지 오답노트 화면

### 목록: `src/app/mypage/notes/page.tsx`

```tsx
// Server Component
// 1. Auth → 로그인된 사용자 확인
// 2. cta_grading_attempt 조회 (is_saved_note=true, 본인 것만)
//    JOIN cta_problem, cta_subject
// 3. NoteList 컴포넌트에 데이터 전달

// 목록 카드 표시 정보:
// - 문제 제목
// - 과목명
// - 총 획득 / 총 배점
// - 저장 일시
// - [상세보기] 링크 → /mypage/notes/[attemptId]
```

### 상세: `src/app/mypage/notes/[attemptId]/page.tsx`

```tsx
// Server Component
// 채점 결과 화면(/problems/result/[attemptId]/page.tsx)와 동일한 렌더 구조 재사용
// 차이점:
//   - 상단 헤더에 "저장일: ..." 표시
//   - "오답노트 저장" 버튼 대신 "오답노트 삭제" 버튼 (is_saved_note=false로 UPDATE)
//   - 힌트/정답보기 버튼 없음 (결과 확인 전용)
```

### 마이페이지 레이아웃: `src/app/mypage/layout.tsx`

```tsx
// 좌측 사이드바 또는 상단 탭 (반응형)
// 메뉴:
//   - 학습 통계  → /mypage
//   - 오답노트   → /mypage/notes
//   - 프로필     → /mypage/profile (향후 확장)
```

---

## 11. 마이페이지 통계 화면

### `src/app/mypage/stats/page.tsx` (또는 /mypage/page.tsx)

```
[탭] 주간 | 월간 | 누적(all)

누적(all) 탭 선택 시 UI:
────────────────────────────────────────
전체 누적
  획득 점수: 1,320점
  (※ 누적 데이터는 순수 획득 점수 총점만 표시하며, 배점 총점, 득점률, 시도 횟수는 제공하지 않음)

세목별 누적
  ┌───────────────┬────────┐
  │ 과목          │ 획득   │
  ├───────────────┼────────┤
  │ 소득세        │  580점 │
  │ 법인세        │  420점 │
  │ 부가가치세    │  320점 │
  └───────────────┴────────┘
────────────────────────────────────────

주간 / 월간 탭 선택 시 UI (기존대로 전체 지표 표시):
────────────────────────────────────────
전체
  획득 점수: 340점  총점: 500점  득점률: 68%
  시도 횟수: 12회

세목별
  ┌───────────────┬────────┬────────┬────────┬──────┐
  │ 과목          │ 획득   │ 총점   │ 득점률 │ 횟수 │
  ├───────────────┼────────┼────────┼────────┼──────┤
  │ 소득세        │  120점 │  180점 │  66.7% │   5회│
  │ 법인세        │   80점 │  120점 │  66.7% │   3회│
  │ 부가가치세    │  140점 │  200점 │  70.0% │   4회│
  └───────────────┴────────┴────────┴────────┴──────┘
```

### 통계 쿼리 (`GET /api/stats`)

```ts
// 기간 필터 (KST 기준)
const cutoff = period === 'weekly'
  ? subDays(startOfTodayKST, 7)
  : period === 'monthly'
  ? subDays(startOfTodayKST, 30)
  : new Date(0)  // all

// 집계 쿼리 — hint_used=false인 순수 채점 결과만 포함
const { data } = await adminSupabase
  .from('cta_grading_attempt')
  .select(`
    result_json,
    cta_problem!inner (
      total_score,
      subject_id,
      cta_subject!inner ( id, name )
    )
  `)
  .eq('user_id', userId)
  .eq('hint_used', false)              // ★ 힌트/정답 사용 시도 제외
  .gte('created_at', cutoff.toISOString())
  .not('result_json', 'is', null)
```

---

## 12. 핵심 코드 예시

### 12-1. `src/app/api/hint/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DAILY_LIMIT = 3

export async function POST(req: Request) {
  // 1. 인증
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  // 2. 권한 확인
  const admin = createAdminClient()
  const { data: ctaUser } = await admin.from('cta_user').select('tier').eq('id', user.id).single()
  if (!ctaUser || !['member', 'pro', 'admin'].includes(ctaUser.tier)) {
    return NextResponse.json({ error: 'member 이상 회원만 이용 가능합니다.' }, { status: 403 })
  }

  // 3. 일일 횟수 제한 (KST 기준)
  const kstOffset = 9 * 60 * 60 * 1000
  const now = new Date()
  const kstNow = new Date(now.getTime() + kstOffset)
  const kstTodayStart = new Date(Date.UTC(
    kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()
  ))
  const utcTodayStart = new Date(kstTodayStart.getTime() - kstOffset)

  const { count } = await admin
    .from('cta_feature_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('feature_type', 'hint')
    .gte('created_at', utcTodayStart.toISOString())

  if ((count || 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `오늘 힌트보기 ${DAILY_LIMIT}회를 모두 사용했습니다.` },
      { status: 403 }
    )
  }

  // 4. 요청 파싱
  const { problemId, subquestionId } = await req.json()
  if (!problemId || !subquestionId) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  // 5. 루브릭에서 keywords_json 조회
  const { data: rubrics, error: rubricErr } = await admin
    .from('cta_subquestion_rubric')
    .select('keywords_json')
    .eq('subquestion_id', subquestionId)

  if (rubricErr || !rubrics) {
    return NextResponse.json({ error: '힌트 데이터를 찾을 수 없습니다.' }, { status: 404 })
  }

  // keywords_json 배열에서 모든 키워드 추출
  const keywords: string[] = rubrics.flatMap((r) => {
    const kj = r.keywords_json
    if (!kj) return []
    if (Array.isArray(kj)) return kj as string[]
    if (typeof kj === 'object') return Object.values(kj).flat() as string[]
    return []
  })

  // 6. 사용 이력 기록
  await admin.from('cta_feature_log').insert({
    user_id: user.id,
    problem_id: problemId,
    subquestion_id: subquestionId,
    feature_type: 'hint',
  })

  return NextResponse.json({
    keywords,
    remainingToday: DAILY_LIMIT - (count || 0) - 1,
  })
}
```

### 12-2. `src/app/api/answer-reveal/route.ts` (핵심 선행조건 검증)

```ts
// (인증·권한·횟수 검증 동일 — 생략)

// 4. 선행조건: 해당 문제/물음에서 hint를 먼저 사용했는지 확인
const { count: hintCount } = await admin
  .from('cta_feature_log')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('problem_id', problemId)
  .eq('subquestion_id', subquestionId)
  .eq('feature_type', 'hint')

if (!hintCount || hintCount === 0) {
  return NextResponse.json(
    { error: '해당 물음의 힌트를 먼저 확인해야 정답을 볼 수 있습니다.' },
    { status: 403 }
  )
}

// 5. 루브릭에서 example_answer_text 조회
const { data: rubrics } = await admin
  .from('cta_subquestion_rubric')
  .select('criterion_name, example_answer_text')
  .eq('subquestion_id', subquestionId)
  .order('display_order')

// 6. answer 로그 기록 + 반환
await admin.from('cta_feature_log').insert({
  user_id: user.id,
  problem_id: problemId,
  subquestion_id: subquestionId,
  feature_type: 'answer',
})

return NextResponse.json({
  rubrics: rubrics?.map((r) => ({
    criterionName: r.criterion_name,
    exampleAnswerText: r.example_answer_text,
  })) || [],
  remainingToday: DAILY_LIMIT - (count || 0) - 1,
})
```

### 12-3. `src/app/api/grade/route.ts` — `hint_used` 플래그 기록 (기존 파일 수정 부분)

채점 API에서 Gemini 채점 호출 **직후**, `cta_grading_attempt` INSERT 시 `hint_used` 값을 함께 저장한다.

```ts
// 7-1. 해당 문제에 힌트/정답 사용 이력이 있는지 확인
const { count: featureCount } = await adminSupabase
  .from('cta_feature_log')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('problem_id', problemId)
  // feature_type 구분 없이 hint 또는 answer 모두 포함

const hintUsedFlag = (featureCount ?? 0) > 0

// 8. 채점 성공 시 로그 기록 (기존 insert에 hint_used 추가)
const { data: attemptData, error: logError } = await adminSupabase
  .from('cta_grading_attempt')
  .insert({
    user_id: user.id,
    problem_id: problemId,
    answers_json: answers,
    result_json: result,
    hint_used: hintUsedFlag,   // ★ 힌트/정답 사용 이력 여부 기록
  })
  .select('id')
  .single()
```

> **주의**: `hint_used = true`인 채점 결과는 저장은 되지만 통계 집계에서 자동 제외된다. 오답노트 저장은 `hint_used` 여부와 무관하게 허용한다.

### 12-4. `src/app/api/stats/route.ts`

```ts
export async function GET(req: Request) {
  // Auth 확인 (생략)

  const url = new URL(req.url)
  const period = (url.searchParams.get('period') || 'weekly') as StatsPeriod

  const kstOffset = 9 * 60 * 60 * 1000
  const now = new Date()
  const kstNow = new Date(now.getTime() + kstOffset)
  const todayStart = new Date(Date.UTC(
    kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()
  ))
  const utcTodayStart = new Date(todayStart.getTime() - kstOffset)

  const cutoff = period === 'weekly'
    ? new Date(utcTodayStart.getTime() - 7 * 24 * 60 * 60 * 1000)
    : period === 'monthly'
    ? new Date(utcTodayStart.getTime() - 30 * 24 * 60 * 60 * 1000)
    : new Date(0)

  const { data: attempts } = await admin
    .from('cta_grading_attempt')
    .select(`
      result_json,
      cta_problem!inner (
        total_score,
        subject_id,
        cta_subject!inner ( id, name )
      )
    `)
    .eq('user_id', userId)
    .eq('hint_used', false)              // ★ 힌트/정답 사용 시도 제외
    .gte('created_at', cutoff.toISOString())
    .not('result_json', 'is', null)

  // 집계 로직
  const subjectMap = new Map<number, SubjectStats>()
  let overallAwarded = 0, overallMax = 0, overallCount = 0

  for (const attempt of (attempts || [])) {
    const prob = attempt.cta_problem as any
    const subj = prob?.cta_subject
    const awarded = Number((attempt.result_json as any)?.totalScore ?? 0)
    const max = prob?.total_score ?? 0

    overallAwarded += awarded
    overallMax += max
    overallCount++

    if (subj) {
      const existing = subjectMap.get(subj.id)
      if (existing) {
        existing.awardedSum += awarded
        existing.maxSum += max
        existing.count++
        existing.ratio = existing.maxSum > 0 ? existing.awardedSum / existing.maxSum : 0
      } else {
        subjectMap.set(subj.id, {
          subjectId: subj.id,
          subjectName: subj.name,
          awardedSum: awarded,
          maxSum: max,
          ratio: max > 0 ? awarded / max : 0,
          count: 1,
        })
      }
    }
  }

  return NextResponse.json({
    period,
    overall: {
      subjectId: -1,
      subjectName: '전체',
      awardedSum: overallAwarded,
      maxSum: overallMax,
      ratio: overallMax > 0 ? overallAwarded / overallMax : 0,
      count: overallCount,
    },
    bySubject: Array.from(subjectMap.values()),
  })
}
```

---

## 13. 구현 순서 우선순위

| 순위 | 작업 | 예상 소요 | 비고 |
|------|------|-----------|------|
| 1 | DB 스키마 적용 (ALTER + 신규 테이블) | 0.5일 | Supabase SQL 에디터 실행 |
| 2 | 타입 정의 추가 (`db.ts`, `hint.ts`, `stats.ts`) | 0.5일 | |
| 3 | `POST /api/hint` Route Handler | 1일 | |
| 4 | `POST /api/answer-reveal` Route Handler | 1일 | 선행조건 검증 포함 |
| 5 | `AnswerForm.tsx` UI 수정 (힌트/정답 패널) | 1일 | |
| 6 | `POST /api/note/save` + `SaveNoteButton` | 0.5일 | |
| 7 | 마이페이지 레이아웃 + 오답노트 목록·상세 | 1.5일 | |
| 8 | `GET /api/stats` + 통계 화면 | 1일 | |
| 9 | RLS 정책 적용 및 전체 테스트 | 1일 | |
| **합계** | | **~7일** | |

---

## 14. 추후 확장 포인트

| 포인트 | 설명 |
|--------|------|
| 힌트 소비 차등화 | pro 등급은 하루 10회 등 tier별 차등 제한 테이블 운용 |
| 차트 시각화 | `recharts` 또는 `chart.js` 추가, StatsView에 WeeklyChart 컴포넌트 삽입 |
| 정답 AI 해설 | `example_answer_text` 대신 Gemini API 호출로 맞춤 해설 생성 |
| 오답노트 태그 | `cta_grading_attempt`에 `tags JSONB` 컬럼 추가, 분류 기능 확장 |
| 알림 | 오늘 힌트 잔여 횟수 0 시 이메일/카카오 알림 (Supabase Edge Function) |
| 랭킹 | `v_grading_stats` 뷰 기반 과목별 득점률 랭킹 페이지 |

---

## 📋 검토용 변경 보고서

### 요약

본 문서는 세무사 시험 대비 AI 채점 시스템에 **4개 신규 기능**을 MVP 수준으로 설계한 결과입니다.

### 주요 결정 사항

| 항목 | 결정 | 근거 |
|------|------|------|
| 신규 테이블 수 | 1개 (`cta_feature_log`) | 기존 `cta_grading_attempt`에 2개 컬럼 추가로 오답노트 커버 |
| 정답보기 선행조건 검증 | 서버 Route Handler에서 DB 조회로 이중 검증 | 프론트 우회 API 직접 호출 방어 |
| 통계 계산 방식 | 조회 시 런타임 집계 | 현재 데이터 규모에서 별도 집계 테이블 불필요; 향후 필요 시 확장 |
| 오답노트 구조 | 스냅샷 아님 — 기존 레코드에 플래그만 추가 | 채점 결과(`result_json`)가 이미 JSON 스냅샷으로 저장됨 |
| 권한 검증 위치 | 서버(Route Handler) + 프론트(UI disabled) 이중 적용 | 보안 원칙 준수 |

### 영향 받는 기존 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/components/AnswerForm.tsx` | 수정 | 힌트/정답 버튼 및 패널 추가 |
| `src/app/problems/result/[attemptId]/page.tsx` | 수정 | 오답노트 저장 버튼(`SaveNoteButton`) 추가 |
| `src/types/db.ts` | 수정 | `FeatureLog`, `GradingAttemptNote` 타입 추가 |
| `cta_grading_attempt` (DB) | 수정 | `is_saved_note`, `note_saved_at` 컬럼 추가 |

### 신규 생성 파일

| 파일 | 유형 |
|------|------|
| `src/app/api/hint/route.ts` | Route Handler |
| `src/app/api/answer-reveal/route.ts` | Route Handler |
| `src/app/api/note/save/route.ts` | Route Handler |
| `src/app/api/stats/route.ts` | Route Handler |
| `src/app/mypage/layout.tsx` | 레이아웃 |
| `src/app/mypage/page.tsx` | 페이지(통계) |
| `src/app/mypage/notes/page.tsx` | 페이지(목록) |
| `src/app/mypage/notes/[attemptId]/page.tsx` | 페이지(상세) |
| `src/components/HintPanel.tsx` | 컴포넌트 |
| `src/components/AnswerRevealPanel.tsx` | 컴포넌트 |
| `src/components/SaveNoteButton.tsx` | 컴포넌트 |
| `src/components/mypage/NoteList.tsx` | 컴포넌트 |
| `src/components/mypage/NoteDetail.tsx` | 컴포넌트 |
| `src/components/mypage/StatsView.tsx` | 컴포넌트 |
| `src/types/hint.ts` | 타입 정의 |
| `src/types/stats.ts` | 타입 정의 |

### 리스크 및 주의사항

1. **`cta_grading_attempt` 기존 RLS 정책 확인 필수**: `is_saved_note` 컬럼 UPDATE 권한이 기존 정책에 포함되어 있는지 확인 후, `/api/note/save`에서 admin 클라이언트 사용 여부 결정
2. **`keywords_json` 데이터 형식 확인 필수**: 현재 `Record<string, unknown>` 타입으로 정의되어 있어, 실제 저장된 형태(배열 vs. 객체)에 따라 키워드 추출 로직 조정 필요
3. **`cta_problem → cta_subject` JOIN 지원 확인**: 통계 쿼리에서 `cta_problem!inner (cta_subject!inner (...))` 형태의 중첩 JOIN이 Supabase PostgREST에서 정상 동작하는지 사전 테스트 필요
4. **힌트보기 후 정답보기 선행조건의 유효 기간**: 현재 설계는 "오늘 안에 힌트 사용 이력 존재"를 조건으로 하며, 날짜가 바뀌면 재확인이 필요함. 요구사항에 따라 "세션 내" 또는 "무기한" 으로 조정 가능

---

*문서 최종 작성: 2026-07-11 | 버전: v1.0*
