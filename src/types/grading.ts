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
    /** 유령 근거(무근거 만점) 교정 재시도가 실제로 발생했을 때만 포함되는 관측용 필드. UI는 읽지 않아도 됨 */
    _diagnostics?: {
        retried: boolean
        contradictions: string[]
        /** 길이 미달 또는 반복 문자로 로컬 0점 처리된 물음 번호 목록 (비용 절감 관측용) */
        skippedSubquestions?: number[]
    }
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
    status: 'met' | 'partially_met' | 'unmet'
    /** 답안 원문에서 그대로 인용한 근거. 없으면 빈 문자열(정상 — 미작성 답안/unmet 시) */
    evidenceQuote: string
    /** @deprecated 구버전 저장 데이터(status 없이 met만 있던 행) 호환용. 신규 응답에는 없음 */
    met?: boolean
}
