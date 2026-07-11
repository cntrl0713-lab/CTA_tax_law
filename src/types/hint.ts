/** 힌트보기 요청 (문제 단위) */
export interface HintRequest {
    problemId: number
}

/** 힌트보기 응답 — 문제 내 모든 물음의 키워드를 물음별로 그룹화 */
export interface HintResponse {
    subquestions: {
        number: number
        keywords: string[]
    }[]
    remainingToday: number
}

/** 정답보기 요청 (문제 단위) */
export interface AnswerRevealRequest {
    problemId: number
}

/** 정답보기 응답 — 문제 내 모든 물음의 모범답안을 물음별로 그룹화 */
export interface AnswerRevealResponse {
    subquestions: {
        number: number
        rubrics: {
            criterionName: string
            exampleAnswerText: string | null
        }[]
    }[]
    remainingToday: number
}
