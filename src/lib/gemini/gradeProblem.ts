import { GoogleGenAI, Type } from '@google/genai'
import type { ProblemWithDetails } from '@/types/db'
import type { SubquestionAnswer, GradeResponse, SubquestionResult } from '@/types/grading'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

// 일시적 서버 오류(용량 초과·내부 오류 등)에 재시도할 HTTP 상태 코드
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 4

/**
 * Gemini 호출을 감싸 일시적 오류(503 등)에 지수 백오프로 재시도합니다.
 * 4xx(400·401·403·404 등) 영구 오류는 재시도하지 않고 즉시 던집니다.
 */
async function generateContentWithRetry(
    params: Parameters<typeof ai.models.generateContent>[0]
): ReturnType<typeof ai.models.generateContent> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await ai.models.generateContent(params)
        } catch (err) {
            const status = (err as { status?: number })?.status
            const retryable = status !== undefined && RETRYABLE_STATUS.has(status)
            if (!retryable || attempt >= MAX_RETRIES) throw err
            // 0.5s → 1s → 2s → 4s + 지터(최대 250ms)
            const backoff = 500 * 2 ** attempt + Math.floor(Math.random() * 250)
            console.warn(
                `[grading] Gemini ${status} 오류, ${backoff}ms 후 재시도 (${attempt + 1}/${MAX_RETRIES})`
            )
            await new Promise((resolve) => setTimeout(resolve, backoff))
        }
    }
}

// ── 유령 근거(무근거 만점) 탐지용 휴리스틱 상수. 실행 결과 보고 튜닝 필요 ──
const MIN_EVIDENCE_QUOTE_LENGTH = 6 // 정규화 후 최소 글자 수 (조사 1개 등 무의미한 매칭 방지)
// 인용문이 답안 전체와 거의 같아도 "복붙 방지"로 취급하지 않는다: 한 물음의 답안이 짧고
// 특정 루브릭 한 개만 다루는 경우(예: 판례 법리만 서술) 답안 전체를 인용하는 것이 정확한
// 근거일 수 있음을 실측으로 확인했음 — 답안 전체 복붙 여부만으로는 무의미 근거를 판별할 수 없음

type ParsedGradeResult = Omit<GradeResponse, 'problemId' | 'maxScore' | '_diagnostics'>

/** 공백·주요 문장부호를 제거해 인용 대조 전용으로 정규화합니다. */
function normalizeForEvidenceMatch(text: string): string {
    return text.normalize('NFC').replace(/[\s·.,'"“”‘’()[\]「」『』〈〉《》:;!?~-]/g, '')
}

/**
 * 줄 앞의 번호 매기기 기호(1. / (1) / ① / 가. 등)를 구조적 표지로 보고 제거합니다. 모델이
 * 답안의 서로 다른 줄에 걸친 내용을 하나의 문장으로 이어붙여 인용할 때 이 번호를 흔히 함께
 * 지워버리는데(실측: 답안 "1. …일것\n2. 특수관계인…"을 "…일것 특수관계인…"으로 번호 없이
 * 이어붙여 인용), 답안 쪽에는 번호가 그대로 남아 있어 연속 문자열 대조가 그 지점에서만
 * 어긋나 정당한 근거가 유령 근거로 오판되는 문제를 막기 위함입니다. 문장 중간의 숫자(금액·연도
 * 등 실제 내용)는 건드리지 않도록 줄 시작 위치의 기호만 제거합니다.
 */
function stripListMarkers(text: string): string {
    return text.replace(/^[ \t]*(?:\(\d{1,3}\)|\d{1,3}[.)]|[①-⑳]|[가나다라마바사아자차카타파하][.)])[ \t]*/gm, '')
}

// 모델이 부분 점수를 소수(예: 0.4)로 반환하는 경우, JS 부동소수점 덧셈 누적 오차로
// 총점이 1.2000000000000002 같은 값이 되어 화면에 그대로 노출될 수 있어 합산 때마다 보정한다.
function round2(n: number): number {
    return Math.round(n * 100) / 100
}

/**
 * DB의 max_score/score/total_score를 신뢰 기준으로 삼아 배점 필드를 교정하고,
 * rubricResults → subquestion → total 순으로 합산 점수를 재계산합니다.
 * 모델의 판단(어느 기준에 점수를 줄지, status가 무엇인지)은 건드리지 않고
 * "배점의 출처"와 "합산 산술"만 교정하는 순수 함수입니다.
 */
function normalizeScoresAgainstRubrics(
    parsed: ParsedGradeResult,
    problem: ProblemWithDetails
): ParsedGradeResult {
    const sqByNumber = new Map(problem.cta_subquestion.map((sq) => [sq.number, sq]))

    const subquestions = parsed.subquestions.map((sq) => {
        const dbSq = sqByNumber.get(sq.number)
        if (!dbSq) {
            console.warn(`[grading] 물음 ${sq.number}에 대응하는 DB 소문항이 없어 배점 교정을 건너뜁니다.`)
            const awardedScore = sq.rubricResults.reduce(
                (s, r) => s + (r.status === 'unmet' ? 0 : r.awardedScore),
                0
            )
            return { ...sq, awardedScore }
        }

        const rubricsByName = new Map(
            dbSq.cta_subquestion_rubric.map((r) => [normalizeForEvidenceMatch(r.criterion_name), r])
        )
        const rubricsInOrder = [...dbSq.cta_subquestion_rubric].sort((a, b) => a.display_order - b.display_order)

        const rubricResults = sq.rubricResults.map((rr, idx) => {
            let dbRubric = rubricsByName.get(normalizeForEvidenceMatch(rr.criterionName))
            if (!dbRubric && rubricsInOrder[idx]) {
                dbRubric = rubricsInOrder[idx] // 이름 불일치 시 위치 기반 폴백
                console.warn(
                    `[grading] 물음 ${sq.number} 기준명 "${rr.criterionName}"이 DB와 일치하지 않아 위치(${idx})로 대체 매칭했습니다.`
                )
            }
            const maxScore = dbRubric ? dbRubric.max_score : rr.maxScore
            // met=만점, unmet=0점은 정의상 고정(시스템 프롬프트 규칙 7: "완전히 충족했으면 met").
            // partially_met만 [0, maxScore]로 클램프. (실측: 결론을 근거보다 먼저 서술하는 두괄식
            // 답안에서, 근거 인용은 정답과 정확히 일치하는데도 status=met이면서 부분 점수만 주는
            // 사례를 확인 — 서술 순서라는 무관한 요인으로 점수만 깎이고 라벨은 정직하게 유지된 것.
            // status가 요건 충족 여부의 최종 판단이므로 라벨을 신뢰하고 점수를 맞춘다.)
            const awardedScore =
                rr.status === 'unmet'
                    ? 0
                    : rr.status === 'met'
                        ? maxScore
                        : round2(Math.min(Math.max(rr.awardedScore, 0), maxScore))
            // 역방향 라벨 불일치 교정: 0점인데 status가 unmet이 아니면(예: partially_met+0점)
            // 규칙 7의 자체 정의("부분 점수조차 부여할 수 없으면 unmet")에 맞춰 라벨만 정리
            const status = awardedScore === 0 ? 'unmet' : rr.status
            return { ...rr, maxScore, awardedScore, status }
        })

        const awardedScoreRaw = round2(rubricResults.reduce((s, r) => s + r.awardedScore, 0))
        const awardedScore = Math.min(awardedScoreRaw, dbSq.score)
        if (awardedScoreRaw !== awardedScore) {
            console.warn(
                `[grading] 물음 ${sq.number} 루브릭 합산(${awardedScoreRaw})이 배점(${dbSq.score})을 초과해 절삭했습니다.`
            )
        }

        return { ...sq, maxScore: dbSq.score, rubricResults, awardedScore }
    })

    const totalScoreRaw = round2(subquestions.reduce((s, sq) => s + sq.awardedScore, 0))
    const totalScore = Math.min(totalScoreRaw, problem.total_score)

    return { ...parsed, subquestions, totalScore }
}

interface Contradiction {
    subquestionNumber: number
    criterionName: string
    evidenceQuote: string
    reason: 'missing_evidence' | 'evidence_not_in_answer' | 'evidence_too_trivial' | 'evidence_present_but_unmet'
}

/**
 * evidenceQuote를 줄바꿈 단위로 나눠, 답안 안에서 서로 떨어진 여러 문장을 이어붙여 인용한
 * 경우에도 각 조각이 개별적으로 답안에 실존하기만 하면 정당한 근거로 인정합니다. (실측: 답안이
 * "정답 항목 - 오답 항목 - 정답 항목" 순으로 나열된 경우, 모델이 오답 항목만 건너뛰고 두 정답
 * 문장을 줄바꿈으로 이어붙여 인용 — 답안에 실제로 있는 내용인데도 "연속된 하나의 문자열"로는
 * 답안에 없으므로 유령 근거로 오판되어 정당한 점수까지 강제로 0점 처리되는 사례를 확인함)
 * 조각 단위로 나누어도 각 조각이 실제로 존재해야 하므로 할루시네이션 방지 효과는 그대로 유지됩니다.
 */
function isEvidenceQuoteVerified(quote: string, normalizedAnswer: string): boolean {
    const segments = stripListMarkers(quote)
        .split(/\n+/)
        .map((s) => normalizeForEvidenceMatch(s.trim()))
        .filter((s) => s.length > 0)
    return segments.length > 0 && segments.every((seg) => normalizedAnswer.includes(seg))
}

/**
 * "충족(met/partially_met) + 0점 초과"로 판정했음에도 근거 인용이 없거나, 답안에 실제로
 * 존재하지 않거나, 근거로서 무의미(조사 한 개 등 지나치게 짧음)한 루브릭 결과를 찾습니다.
 * 완결성(요건을 "완전히" 충족했는지)은 판단하지 않고 "인용문이 답안에 실존하는가"만 확인합니다.
 * 인용문이 답안 전체와 겹치더라도, 그 자체로는 무의미하다고 보지 않습니다(실측 결과: 답안이
 * 짧고 특정 루브릭 하나만 다루는 경우 답안 전체 인용이 정확한 근거일 수 있음).
 */
function findPhantomEvidence(result: ParsedGradeResult, answers: SubquestionAnswer[]): Contradiction[] {
    const answerByNumber = new Map(answers.map((a) => [a.subquestionNumber, a.answerText || '']))
    const contradictions: Contradiction[] = []

    for (const sq of result.subquestions) {
        const normalizedAnswer = normalizeForEvidenceMatch(stripListMarkers(answerByNumber.get(sq.number) ?? ''))

        for (const rr of sq.rubricResults) {
            const credited = rr.status !== 'unmet' && rr.awardedScore > 0
            if (!credited) continue // 미충족/0점은 근거 검증 대상이 아님 (정상)

            const quote = (rr.evidenceQuote || '').trim()
            if (quote.length === 0) {
                contradictions.push({
                    subquestionNumber: sq.number,
                    criterionName: rr.criterionName,
                    evidenceQuote: rr.evidenceQuote,
                    reason: 'missing_evidence',
                })
                continue
            }

            const normalizedQuote = normalizeForEvidenceMatch(stripListMarkers(quote))
            const tooShort = normalizedQuote.length < MIN_EVIDENCE_QUOTE_LENGTH

            if (tooShort) {
                contradictions.push({
                    subquestionNumber: sq.number,
                    criterionName: rr.criterionName,
                    evidenceQuote: rr.evidenceQuote,
                    reason: 'evidence_too_trivial',
                })
                continue
            }

            if (!isEvidenceQuoteVerified(quote, normalizedAnswer)) {
                contradictions.push({
                    subquestionNumber: sq.number,
                    criterionName: rr.criterionName,
                    evidenceQuote: rr.evidenceQuote,
                    reason: 'evidence_not_in_answer',
                })
            }
        }
    }
    return contradictions
}

/**
 * findPhantomEvidence의 대칭 케이스: unmet+0점으로 판정했음에도 모델 스스로 채운 evidenceQuote가
 * 실제로 답안에 존재하는 루브릭 결과를 찾습니다. (관측된 원인: 여러 물음을 한 번에 채점할 때
 * 특정 물음·기준에서 실제로는 근거를 찾았으면서도 점수를 억눌러 unmet 처리하는 현상 — 같은 답안을
 * 해당 물음만 단독으로 채점하면 정상적으로 점수를 받는 것으로 실측 확인됨. 정상 케이스인 "근거 없어
 * 정당하게 unmet"과 구분하기 위해, 인용문이 비어있거나 너무 짧은 경우는 건드리지 않습니다.
 */
function findSuppressedEvidence(result: ParsedGradeResult, answers: SubquestionAnswer[]): Contradiction[] {
    const answerByNumber = new Map(answers.map((a) => [a.subquestionNumber, a.answerText || '']))
    const contradictions: Contradiction[] = []

    for (const sq of result.subquestions) {
        const normalizedAnswer = normalizeForEvidenceMatch(stripListMarkers(answerByNumber.get(sq.number) ?? ''))

        for (const rr of sq.rubricResults) {
            if (rr.status !== 'unmet') continue // met/partially_met은 findPhantomEvidence가 담당

            const quote = (rr.evidenceQuote || '').trim()
            if (quote.length === 0) continue // 정상: 근거 없음 + unmet

            const normalizedQuote = normalizeForEvidenceMatch(stripListMarkers(quote))
            if (normalizedQuote.length < MIN_EVIDENCE_QUOTE_LENGTH) continue // 너무 짧아 신뢰 어려움

            if (isEvidenceQuoteVerified(quote, normalizedAnswer)) {
                contradictions.push({
                    subquestionNumber: sq.number,
                    criterionName: rr.criterionName,
                    evidenceQuote: rr.evidenceQuote,
                    reason: 'evidence_present_but_unmet',
                })
            }
        }
    }
    return contradictions
}

interface Correction {
    subquestionNumber: number
    criterionName: string
    evidenceQuote: string
    status: 'met' | 'partially_met' | 'unmet'
    awardedScore: number
}

/**
 * 교정 재시도용 축소 스키마. 전체 응답을 다시 생성시키면 모델이 "다른 기준은 그대로 두라"는
 * 지시를 안정적으로 지키지 못해(관측됨: 무관한 물음까지 0점으로 붕괴) 무관한 물음에 부수 피해가
 * 생길 수 있으므로, 모순이 발견된 기준만 담은 corrections 배열만 반환하도록 강제합니다.
 */
const CORRECTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        corrections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    subquestionNumber: { type: Type.NUMBER, description: '물음 번호' },
                    criterionName: { type: Type.STRING, description: '루브릭 기준명 (제시된 것과 정확히 동일하게)' },
                    evidenceQuote: { type: Type.STRING, description: '답안 원문에서 그대로 가져온 인용문. 근거가 없으면 빈 문자열' },
                    status: { type: Type.STRING, description: '기준 충족 여부 (met | partially_met | unmet)' },
                    awardedScore: { type: Type.NUMBER, description: '획득 점수' },
                },
                propertyOrdering: ['subquestionNumber', 'criterionName', 'evidenceQuote', 'status', 'awardedScore'],
                required: ['subquestionNumber', 'criterionName', 'evidenceQuote', 'status', 'awardedScore'],
            },
        },
    },
    required: ['corrections'],
}

/** 유령 근거·억눌린 근거가 발견된 기준만 콕 집어 재평가를 요청하는 후속 사용자 턴 메시지를 만듭니다. */
function buildCorrectionRequest(contradictions: Contradiction[]): string {
    const reasonText = (c: Contradiction) => {
        switch (c.reason) {
            case 'missing_evidence':
                return '점수를 부여했지만 근거 인용문(evidenceQuote)이 비어 있음'
            case 'evidence_not_in_answer':
                return `점수를 부여했지만 인용한 문구("${c.evidenceQuote}")가 실제 답안에 존재하지 않음`
            case 'evidence_too_trivial':
                return `점수를 부여했지만 인용문이 너무 짧아 유효한 근거로 볼 수 없음("${c.evidenceQuote}")`
            case 'evidence_present_but_unmet':
                return `unmet(0점)으로 판정했지만, 스스로 인용한 문구("${c.evidenceQuote}")가 실제로 답안에 존재함 — 부당하게 0점 처리된 것은 아닌지 재확인 필요`
        }
    }

    const lines = contradictions.map((c) => `- 물음 ${c.subquestionNumber} / 기준 "${c.criterionName}": ${reasonText(c)}`)

    return `방금 채점한 결과 중 아래 채점 기준들의 점수 판정을 다시 확인해야 합니다.
${lines.join('\n')}

이 기준들만 답안을 처음부터 다시 확인해 정직하게 재평가하고, 정확히 이 ${contradictions.length}개 항목에 대한 교정 결과만 corrections 배열로 반환하세요.
- 다른 물음이나 다른 채점 기준의 판정에 얽매이지 말고, 지금 재검토하는 기준 하나만 놓고 이 물음의 답안을 독립적으로 다시 읽으세요.
- 답안에 실제로 있는 문장을 그대로 evidenceQuote로 인용할 수 있는 경우에만 met 또는 partially_met과 0보다 큰 점수를 부여하세요.
- 답안에 해당 내용이 전혀 없다면 반드시 status를 unmet, awardedScore를 0, evidenceQuote를 빈 문자열로 하세요.
- 위에 나열되지 않은 다른 물음이나 채점 기준은 절대 언급하거나 포함하지 마세요.`
}

/**
 * 교정 응답의 corrections를 원본 결과에 병합합니다. 모델이 무엇을 반환하든, 애초에 모순으로
 * 식별된 (물음, 기준) 키에 해당하는 항목만 반영합니다 — 그 외 물음/기준/feedback/총평은
 * 1차 결과 그대로 유지되어 무관한 항목에 대한 부수 피해를 코드 수준에서 원천 차단합니다.
 */
function applyCorrections(
    result: ParsedGradeResult,
    contradictions: Contradiction[],
    corrections: Correction[]
): ParsedGradeResult {
    const key = (subquestionNumber: number, criterionName: string) =>
        `${subquestionNumber}::${normalizeForEvidenceMatch(criterionName)}`
    const flaggedKeys = new Set(contradictions.map((c) => key(c.subquestionNumber, c.criterionName)))
    const byKey = new Map(
        corrections
            .filter((c) => flaggedKeys.has(key(c.subquestionNumber, c.criterionName)))
            .map((c) => [key(c.subquestionNumber, c.criterionName), c])
    )

    return {
        ...result,
        subquestions: result.subquestions.map((sq) => {
            const rubricResults = sq.rubricResults.map((rr) => {
                const c = byKey.get(key(sq.number, rr.criterionName))
                if (!c) return rr
                return { ...rr, evidenceQuote: c.evidenceQuote, status: c.status, awardedScore: c.awardedScore }
            })
            return { ...sq, rubricResults }
        }),
    }
}

/**
 * 재시도 이후에도 남은 모순에 대해, 해당 루브릭 결과만 강제로 awardedScore=0, status='unmet'으로
 * 되돌립니다(evidence_present_but_unmet의 경우 이미 0점/unmet이므로 사실상 유지). 합산 재계산은
 * 호출부에서 normalizeScoresAgainstRubrics를 다시 호출해 수행합니다(단일 책임 유지). 순수 함수입니다.
 */
function forceZeroOutContradictions(
    result: ParsedGradeResult,
    contradictions: Contradiction[]
): ParsedGradeResult {
    if (contradictions.length === 0) return result

    const flagged = new Set(contradictions.map((c) => `${c.subquestionNumber}::${c.criterionName}`))

    return {
        ...result,
        subquestions: result.subquestions.map((sq) => ({
            ...sq,
            rubricResults: sq.rubricResults.map((rr) =>
                flagged.has(`${sq.number}::${rr.criterionName}`)
                    ? { ...rr, awardedScore: 0, status: 'unmet' as const }
                    : rr
            ),
        })),
    }
}

const systemPrompt = `당신은 세무사 시험 채점 전문가입니다.
아래의 세법 문제에 대한 수험생 답안을 채점해 주세요.

채점 원칙:
1. 각 물음의 배점을 절대 초과하지 마세요.
2. 각 루브릭 기준별로 배점 내에서 점수를 부여하세요.
3. 루브릭의 max_score를 초과하지 마세요.
4. 논리 구조를 중심으로 평가하세요.
5. 채점 기준은 "문구의 일치"가 아니라 "요건 충족의 실질"입니다. 수험생의 표현·어휘·문장 순서가 채점 기준 설명이나 모범답안 예시와 다르더라도, 법리적으로 같은 의미를 담고 있다면 만점(met)을 주세요. 결론을 근거보다 먼저 쓰는 등 서술 순서가 다르다는 이유만으로, 또는 모범답안과 다른 단어를 썼다는 이유만으로 감점하지 마세요.
6. 피드백은 공백 포함 150자 이내로 어떤 부분이 좋았고 무엇이 부족한지 구체적으로 명시하세요.
7. 개별 채점 기준에 대해서는 수험생 답안이 기준을 완전히 충족했으면 met, 부분적으로 충족했으면 partially_met, 충족하지 못해 부분 점수조차 부여할 수 없으면 unmet으로 판단하세요.
8. 핵심 요건(수치, 법적 절차 요건 등)의 실질적 내용이 답안에 전혀 담겨 있지 않은 경우에만 부분 점수(partially_met) 또는 미충족(unmet) 처리를 하십시오. 서술이 간결하거나 모범답안과 다른 방식·순서로 쓰였다는 이유만으로 만점을 깎지 마세요 — 표현 방식이 아니라 요건의 실질적 누락 여부로만 판단하세요.
9. 감점 요인이 있는 경우 피드백에 적은 문제점과 평가 점수가 논리적으로 모순되지 않도록 하십시오.
10. 모든 응답은 한국어로 작성하세요.
11. 각 채점 기준의 evidenceQuote에는 반드시 수험생 답안 원문에 실제로 있는 문장/구절을 그대로(축약·의역 없이) 옮겨 적으세요. 답안에 없는 내용을 근거로 점수를 주지 마세요.
12. 답안에 해당 기준을 뒷받침하는 문장이 전혀 없다면, 다른 부분이 아무리 훌륭해도 그 기준은 반드시 unmet과 0점으로 처리하고 evidenceQuote는 빈 문자열로 남기세요. 근거를 인용할 수 없는 기준에 점수를 부여하는 것은 심각한 채점 오류입니다. (단, 규칙 5에 따라 표현이 다를 뿐 같은 의미의 문장이 답안에 있다면 이는 "근거가 있는" 경우이지 "근거가 없는" 경우가 아닙니다.)
13. 각 채점 기준은 반드시 서로 독립적으로 판단하세요. 같은 물음 안의 다른 채점 기준에 대한 서술이 부족하거나 아예 없더라도, 지금 판단 중인 기준을 뒷받침하는 문장이 답안에 실제로 있다면 그 기준에는 정당하게 점수를 부여해야 합니다. 답안 전체나 물음 전체의 인상(예: "이 물음은 답안이 부실하다")만으로 개별 기준들을 일괄적으로 unmet 처리하지 마세요 — 기준마다 답안 전체를 처음부터 다시 확인하세요.`

/** 물음마다 공통으로 필요한 문제 배경(제목·배점·사실관계·쟁점) 블록. 물음 개수만큼 반복 전송된다. */
function buildFixedOverhead(problem: ProblemWithDetails): string {
    return `
## 문제 정보
제목: ${problem.title}
총 배점: ${problem.total_score}점

### 사실관계
${problem.case_text_compact || problem.case_text_full || '(사실관계 없음)'}

### 쟁점
${problem.issue_text_compact || problem.issue_text_full || '(쟁점 없음)'}
`
}

/** 물음 하나의 프롬프트 블록(문제·루브릭·답안). */
function buildSubquestionBlock(
    sq: ProblemWithDetails['cta_subquestion'][number],
    answerText: string | undefined
): string {
    const rubrics = sq.cta_subquestion_rubric
        .sort((a, b) => a.display_order - b.display_order)
        .map((r) => {
            // 채점 정확도를 위해 기준 설명은 전문(full)을 우선 사용 (compact는 정보 손실로 오채점 유발)
            const desc = r.description_display || r.description_compact
            return `  - 기준명: "${r.criterion_name}" (배점: ${r.max_score}점)${desc ? `\n    설명: ${desc}` : ''}${r.example_answer_text ? `\n    모범답안: ${r.example_answer_text}` : ''}`
        })
        .join('\n')

    return `
### 물음 ${sq.number} (배점: ${sq.score}점)
문제: ${sq.prompt_text_compact || sq.prompt_text_full || '(문제 텍스트 없음)'}

채점 루브릭:
${rubrics}

수험생 답안:
${answerText || '(답안 미작성)'}
`
}

const RUBRIC_RESULT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        criterionName: { type: Type.STRING, description: '루브릭 기준명' },
        evidenceQuote: {
            type: Type.STRING,
            description:
                '이 기준을 met 또는 partially_met으로 판단한 근거가 되는, 수험생 답안 원문에서 그대로(변형 없이) 가져온 인용문. ' +
                '답안에 해당 근거가 전혀 없어 unmet으로 판단하는 경우에는 빈 문자열("")로 두세요. 답안에 없는 내용을 지어내거나 답안 전체를 그대로 복사하지 마세요.',
        },
        status: { type: Type.STRING, description: '기준 충족 여부 (met: 완벽 충족, partially_met: 부분 충족, unmet: 미충족)' },
        awardedScore: { type: Type.NUMBER, description: '획득 점수' },
        maxScore: { type: Type.NUMBER, description: '배점' },
    },
    propertyOrdering: ['criterionName', 'evidenceQuote', 'status', 'awardedScore', 'maxScore'],
    required: ['criterionName', 'evidenceQuote', 'status', 'awardedScore', 'maxScore'],
}

/**
 * 물음 하나만 채점하는 축소 스키마. 예전에는 문제 전체(모든 물음)를 하나의 응답으로 한 번에
 * 받았으나, 이 경우 같은 물음 안의 채점 기준 판단이 "옆에 같이 채점되는 다른 물음"의 내용에
 * 영향을 받아 met/unmet 판정이 오염되는 현상이 실측으로 확인되어(예: 무관한 다른 물음이
 * 강한 답안이면 이 물음의 미흡한 기준까지 만점 처리) 물음 단위 독립 호출로 전환했다.
 */
const SUBQUESTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        number: { type: Type.NUMBER, description: '물음 번호' },
        awardedScore: { type: Type.NUMBER, description: '획득 점수' },
        maxScore: { type: Type.NUMBER, description: '배점' },
        feedback: { type: Type.STRING, description: '물음별 피드백 (공백 포함 150자 이내)' },
        rubricResults: { type: Type.ARRAY, items: RUBRIC_RESULT_SCHEMA },
    },
    required: ['number', 'awardedScore', 'maxScore', 'feedback', 'rubricResults'],
}

/** 전체 총평 합성 전용 축소 스키마 (물음별 채점 결과가 이미 확정된 뒤, 요약 문장 하나만 생성) */
const OVERALL_COMMENT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        overallComment: { type: Type.STRING, description: '전체 총평 (공백 포함 80자 이내로 간결히 요약)' },
    },
    required: ['overallComment'],
}

/**
 * 물음 하나를 독립적으로 채점합니다. 1차 호출 → 유령 근거/억눌린 근거 탐지 → (모순이 있으면)
 * 이 물음의 대화만 재사용한 스코프 축소형 교정 재시도, 순서로 진행합니다. 다른 물음의 내용은
 * 이 호출의 프롬프트에 전혀 포함되지 않으므로, 다물음 동시채점 교차오염이 구조적으로 발생할 수 없습니다.
 */
async function gradeSingleSubquestion(
    problem: ProblemWithDetails,
    sq: ProblemWithDetails['cta_subquestion'][number],
    answerText: string | undefined
): Promise<{ subquestion: SubquestionResult; diagnostics?: { retried: boolean; contradictions: string[] } }> {
    const answers: SubquestionAnswer[] = [{ subquestionNumber: sq.number, answerText: answerText || '' }]
    const userPrompt = buildFixedOverhead(problem) + buildSubquestionBlock(sq, answerText)

    const config = {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json' as const,
        temperature: 0,
        // flash-lite는 thinking이 기본 비활성 — 루브릭 대조 정확도를 위해 활성화
        thinkingConfig: { thinkingBudget: 1024 },
        responseSchema: SUBQUESTION_SCHEMA,
    }

    const response = await generateContentWithRetry({
        model: 'gemini-2.5-flash-lite',
        contents: userPrompt,
        config,
    })

    const text = response.text
    if (!text) {
        throw new Error(`Gemini 응답이 비어 있습니다. (물음 ${sq.number})`)
    }

    // 모델이 스스로 되돌려주는 number 필드는 신뢰하지 않는다(실측: 단독 호출에서 1.23 같은
    // 값을 반환한 사례 확인). 어차피 이 호출이 어느 물음을 채점 중인지는 이미 알고 있으므로
    // 항상 실제 sq.number로 덮어써 하류(정규화·근거 검증)가 잘못된 번호로 어긋나지 않게 한다.
    const parsedSubquestion = { ...(JSON.parse(text) as SubquestionResult), number: sq.number }
    let normalized = normalizeScoresAgainstRubrics(
        { subquestions: [parsedSubquestion], totalScore: 0, overallComment: '' },
        problem
    )

    const contradictions = [...findPhantomEvidence(normalized, answers), ...findSuppressedEvidence(normalized, answers)]
    if (contradictions.length === 0) {
        return { subquestion: normalized.subquestions[0] }
    }

    const describe = (cs: Contradiction[]) => cs.map((c) => `물음 ${c.subquestionNumber} - ${c.criterionName} (${c.reason})`)
    try {
        // 스코프 축소형 교정 재시도: 이 물음의 1차 대화만 재사용해, 모순이 발견된 기준만 재판정받고
        // 코드에서 병합합니다 — 다른 물음은 애초에 이 대화에 포함된 적이 없습니다.
        const correctionResponse = await generateContentWithRetry({
            model: 'gemini-2.5-flash-lite',
            contents: [
                { role: 'user', parts: [{ text: userPrompt }] },
                { role: 'model', parts: [{ text }] },
                { role: 'user', parts: [{ text: buildCorrectionRequest(contradictions) }] },
            ],
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json' as const,
                temperature: 0,
                thinkingConfig: { thinkingBudget: 1024 },
                responseSchema: CORRECTION_SCHEMA,
            },
        })
        const correctionText = correctionResponse.text
        if (!correctionText) throw new Error('교정 재시도 응답이 비어 있습니다.')

        const { corrections } = JSON.parse(correctionText) as { corrections: Correction[] }
        let patched = normalizeScoresAgainstRubrics(
            applyCorrections(normalized, contradictions, corrections),
            problem
        )
        const remaining = [...findPhantomEvidence(patched, answers), ...findSuppressedEvidence(patched, answers)]

        if (remaining.length > 0) {
            console.warn(`[grading] 물음 ${sq.number} 유령 근거 교정 재시도 후에도 모순 잔존, 강제 0점 처리:`, remaining)
            patched = normalizeScoresAgainstRubrics(forceZeroOutContradictions(patched, remaining), problem)
        }
        normalized = patched
        return {
            subquestion: normalized.subquestions[0],
            diagnostics: { retried: true, contradictions: describe(remaining.length > 0 ? remaining : contradictions) },
        }
    } catch (err) {
        console.warn(`[grading] 물음 ${sq.number} 유령 근거 교정 재시도 실패, 원본 결과에서 강제 0점 처리:`, err, contradictions)
        normalized = normalizeScoresAgainstRubrics(forceZeroOutContradictions(normalized, contradictions), problem)
        return {
            subquestion: normalized.subquestions[0],
            diagnostics: { retried: false, contradictions: describe(contradictions) },
        }
    }
}

/**
 * 모든 물음의 채점이 끝난 뒤, 물음별 점수·피드백만 가지고 전체 총평 한 문장을 합성합니다.
 * 원본 답안·루브릭 전문을 다시 보내지 않아 저렴합니다(물음 개수와 무관하게 항상 1회 호출).
 */
async function synthesizeOverallComment(
    problem: ProblemWithDetails,
    subquestions: SubquestionResult[],
    totalScore: number
): Promise<string> {
    const summary = subquestions
        .map((sq) => `물음 ${sq.number}: ${sq.awardedScore}/${sq.maxScore}점 — ${sq.feedback}`)
        .join('\n')

    const prompt = `다음은 "${problem.title}" 문제(총 배점 ${problem.total_score}점)에 대한 물음별 채점 결과입니다.
${summary}

총점: ${totalScore}/${problem.total_score}점

위 물음별 결과를 종합하여, 수험생에게 보여줄 전체 총평을 한국어로 한 문장(공백 포함 80자 이내)으로 간결하게 작성하세요. 잘한 점과 부족한 점을 균형 있게 반영하세요.`

    const response = await generateContentWithRetry({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
            responseMimeType: 'application/json' as const,
            temperature: 0,
            responseSchema: OVERALL_COMMENT_SCHEMA,
        },
    })

    const text = response.text
    if (!text) return '채점이 완료되었습니다.'

    const { overallComment } = JSON.parse(text) as { overallComment: string }
    return overallComment || '채점이 완료되었습니다.'
}

/**
 * Gemini 2.5 Flash-Lite를 호출하여 구조화된 JSON 채점 결과를 반환합니다.
 * 물음마다 독립된 호출로 병렬 채점한 뒤(다물음 동시채점 교차오염 방지), 총평만 별도로 합성합니다.
 */
export async function gradeProblem(
    problem: ProblemWithDetails,
    answers: SubquestionAnswer[]
): Promise<GradeResponse> {
    const results = await Promise.all(
        problem.cta_subquestion.map((sq) => {
            const answer = answers.find((a) => a.subquestionNumber === sq.number)
            return gradeSingleSubquestion(problem, sq, answer?.answerText)
        })
    )

    // 버그 2(산술 불일치) 수정: 배점 출처를 DB로 교정하고 물음 간 합산(총점)을 재계산 — 항상 적용
    const normalizedAll = normalizeScoresAgainstRubrics(
        { subquestions: results.map((r) => r.subquestion), totalScore: 0, overallComment: '' },
        problem
    )

    const overallComment = await synthesizeOverallComment(problem, normalizedAll.subquestions, normalizedAll.totalScore)

    const diagnosticsList = results.map((r) => r.diagnostics).filter((d): d is { retried: boolean; contradictions: string[] } => !!d)
    const diagnostics: GradeResponse['_diagnostics'] | undefined =
        diagnosticsList.length > 0
            ? {
                retried: diagnosticsList.some((d) => d.retried),
                contradictions: diagnosticsList.flatMap((d) => d.contradictions),
            }
            : undefined

    return {
        problemId: problem.id,
        maxScore: problem.total_score,
        totalScore: normalizedAll.totalScore,
        subquestions: normalizedAll.subquestions,
        overallComment,
        ...(diagnostics ? { _diagnostics: diagnostics } : {}),
    }
}
