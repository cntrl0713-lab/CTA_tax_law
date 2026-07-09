/** 과목 */
export interface Subject {
    id: number
    name: string
}

/** 문제 */
export interface Problem {
    id: number
    subject_id: number
    title: string
    total_score: number
    case_text_full: string | null
    case_text_compact: string | null
    issue_text_full: string | null
    issue_text_compact: string | null
    created_at: string | null
}

/** 소문항 */
export interface Subquestion {
    id: number
    problem_id: number
    number: number
    score: number
    display_order: number
    prompt_text_full: string | null
    prompt_text_compact: string | null
}

/** 채점 루브릭 */
export interface SubquestionRubric {
    id: number
    subquestion_id: number
    criterion_name: string
    max_score: number
    required: boolean
    display_order: number
    description_display: string | null
    description_compact: string | null
    keywords_json: Record<string, unknown> | null
    example_answer_text: string | null
}

/** 문제 + 소문항 + 루브릭 전체 조인 */
export interface ProblemWithDetails extends Problem {
    subquestions: (Subquestion & {
        subquestion_rubrics: SubquestionRubric[]
    })[]
}

/** 과목 + 문제 수 */
export interface SubjectWithCount extends Subject {
    problem_count: number
}

/** CTA 유저 등급 및 정보 */
export interface CtaUser {
    id: string
    email: string | null
    tier: 'member' | 'pro' | 'admin'
    exp: number
    created_at: string
    updated_at: string
}
