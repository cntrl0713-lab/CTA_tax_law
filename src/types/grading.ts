/** 채점 요청: 클라이언트 → 서버 */
export interface GradeRequest {
    problemId: number
    answers: SubquestionAnswer[]
}

export interface SubquestionAnswer {
    subquestionNumber: number
    answerText: string
}

/** 채점 응답: 서버 → 클라이언트 */
export interface GradeResponse {
    problemId: number
    totalScore: number
    maxScore: number
    subquestions: SubquestionResult[]
    overallComment: string
}

export interface SubquestionResult {
    number: number
    awardedScore: number
    maxScore: number
    feedback: string
    rubricResults: RubricResult[]
}

export interface RubricResult {
    criterionName: string
    awardedScore: number
    maxScore: number
    met: boolean
}
