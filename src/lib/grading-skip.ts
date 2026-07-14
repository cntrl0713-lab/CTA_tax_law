/**
 * 답안 스킵(로컬 0점) 판정 — 서버(gradeProblem.ts)·클라이언트(AnswerForm.tsx) 공용 모듈.
 *
 * 판정 기준을 한 곳에서 관리하여 상수 드리프트를 원천 차단한다.
 * 서버가 실제 판정의 원천이고, 클라이언트는 동일 함수를 import해 사전 안내용으로만 사용한다.
 */

/** 이 길이(공백 포함) 이하의 답안은 어떤 루브릭도 실질 충족이 불가능하므로 AI 호출 없이 0점 처리한다. */
export const MIN_GRADABLE_ANSWER_LENGTH = 15

/** 공백 제거 후 유니크 문자가 이 수 미만이면 무의미한 반복 문자로 판정한다. */
export const MIN_UNIQUE_CHARS = 5

export type SkipReason = 'too_short' | 'repetitive'
export type SkipResult = { skip: true; reason: SkipReason } | { skip: false }

/**
 * 답안이 AI 채점 호출 없이 로컬 0점 처리 대상인지 판정한다.
 *
 * - 공백 포함 길이가 `MIN_GRADABLE_ANSWER_LENGTH` 이하 → `too_short`
 * - 길이는 넘지만 공백 제거 후 유니크 문자 종류가 `MIN_UNIQUE_CHARS` 미만 → `repetitive`
 *
 * 서버(`gradeSingleSubquestion`, `allSkipped` 판정)와 클라이언트(제출 전 안내/차단)가
 * 이 함수를 공유하여 판정 기준의 드리프트를 원천 차단한다.
 */
export function isLocallySkippable(answerText: string | undefined): SkipResult {
    const trimmed = (answerText ?? '').trim()
    if (trimmed.length <= MIN_GRADABLE_ANSWER_LENGTH) {
        return { skip: true, reason: 'too_short' }
    }
    const uniqueChars = new Set(trimmed.replace(/\s/g, '')).size
    if (uniqueChars < MIN_UNIQUE_CHARS) {
        return { skip: true, reason: 'repetitive' }
    }
    return { skip: false }
}
