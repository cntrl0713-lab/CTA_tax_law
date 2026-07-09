import { GoogleGenAI, Type } from '@google/genai'
import type { ProblemWithDetails } from '@/types/db'
import type { SubquestionAnswer, GradeResponse } from '@/types/grading'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

/**
 * Gemini 2.5 Flash-Lite를 호출하여 구조화된 JSON 채점 결과를 반환합니다.
 */
export async function gradeProblem(
    problem: ProblemWithDetails,
    answers: SubquestionAnswer[]
): Promise<GradeResponse> {
    // ── 프롬프트 구성 ──
    const subquestionPrompts = problem.subquestions.map((sq) => {
        const answer = answers.find((a) => a.subquestionNumber === sq.number)
        const rubrics = sq.subquestion_rubrics
            .sort((a, b) => a.display_order - b.display_order)
            .map((r) => {
                const desc = r.description_compact || r.description_display
                return `  - 기준명: "${r.criterion_name}" (배점: ${r.max_score}점)${desc ? `\n    설명: ${desc}` : ''}${r.keywords_json ? `\n    키워드: ${JSON.stringify(r.keywords_json)}` : ''}${r.example_answer_text ? `\n    모범답안: ${r.example_answer_text}` : ''}`
            })
            .join('\n')

        return `
### 물음 ${sq.number} (배점: ${sq.score}점)
문제: ${sq.prompt_text_compact || sq.prompt_text_full || '(문제 텍스트 없음)'}

채점 루브릭:
${rubrics}

수험생 답안:
${answer?.answerText || '(답안 미작성)'}
`
    })

    const systemPrompt = `당신은 세무사 시험 채점 전문가입니다. 
아래의 세법 문제에 대한 수험생 답안을 채점해 주세요.

채점 원칙:
1. 각 물음의 배점을 절대 초과하지 마세요.
2. 각 루브릭 기준별로 배점 내에서 점수를 부여하세요.
3. 루브릭의 max_score를 초과하지 마세요.
4. 핵심 키워드와 논리 구조를 중심으로 평가하세요.
5. 피드백은 공백 포함 150자 이내로 어떤 부분이 좋았고 무엇이 부족한지 구체적으로 명시하세요. 전체 총평은 공백 포함 200자 이내로 작성하세요.
6. 모든 응답은 한국어로 작성하세요.`

    const userPrompt = `
## 문제 정보
제목: ${problem.title}
총 배점: ${problem.total_score}점

### 사실관계
${problem.case_text_compact || problem.case_text_full || '(사실관계 없음)'}

### 쟁점
${problem.issue_text_compact || problem.issue_text_full || '(쟁점 없음)'}

${subquestionPrompts.join('\n---\n')}
`

    // ── Gemini 호출 (구조화 출력) ──
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: userPrompt,
        config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    totalScore: { type: Type.NUMBER, description: '수험생 총 획득 점수' },
                    subquestions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                number: { type: Type.NUMBER, description: '물음 번호' },
                                awardedScore: { type: Type.NUMBER, description: '획득 점수' },
                                maxScore: { type: Type.NUMBER, description: '배점' },
                                feedback: { type: Type.STRING, description: '물음별 피드백 (공백 포함 150자 이내)' },
                                rubricResults: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            criterionName: { type: Type.STRING, description: '루브릭 기준명' },
                                            awardedScore: { type: Type.NUMBER, description: '획득 점수' },
                                            maxScore: { type: Type.NUMBER, description: '배점' },
                                            met: { type: Type.BOOLEAN, description: '기준 충족 여부' },
                                        },
                                        required: ['criterionName', 'awardedScore', 'maxScore', 'met'],
                                    },
                                },
                            },
                            required: ['number', 'awardedScore', 'maxScore', 'feedback', 'rubricResults'],
                        },
                    },
                    overallComment: { type: Type.STRING, description: '전체 총평 (공백 포함 200자 이내)' },
                },
                required: ['totalScore', 'subquestions', 'overallComment'],
            },
        },
    })

    const text = response.text
    if (!text) {
        throw new Error('Gemini 응답이 비어 있습니다.')
    }

    const parsed = JSON.parse(text) as Omit<GradeResponse, 'problemId' | 'maxScore'>

    return {
        problemId: problem.id,
        maxScore: problem.total_score,
        totalScore: parsed.totalScore,
        subquestions: parsed.subquestions,
        overallComment: parsed.overallComment,
    }
}
