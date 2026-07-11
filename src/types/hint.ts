/** 힌트보기 요청 */
export interface HintRequest {
    problemId: number
    subquestionId: number
}

/** 힌트보기 응답 */
export interface HintResponse {
    keywords: string[]
    remainingToday: number
}

/** 정답보기 요청 */
export interface AnswerRevealRequest {
    problemId: number
    subquestionId: number
}

/** 정답보기 응답 */
export interface AnswerRevealResponse {
    rubrics: {
        criterionName: string
        exampleAnswerText: string | null
    }[]
    remainingToday: number
}
