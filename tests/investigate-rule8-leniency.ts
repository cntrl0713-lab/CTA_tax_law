/**
 * 진단 스크립트 — tests/README.md "미해결로 남은 이슈"(문제1 물음1 "재산가치 증가사유 발생
 * 요건"이 시기 요건(5년 이내)을 통째로 빼도 met+만점 처리되는 시스템 프롬프트 규칙 8 관련
 * 과다 관대화)의 메커니즘을 더 좁혀본다. 기존 조사(README)는 이미 다음을 확인/기각했다:
 *   - 배치(다물음 동시채점) 문제 아님 — 단독 호출로 전환해도 재현됨
 *   - 프롬프트 문구 교정 4회, 모델 업그레이드(3.1-flash-lite) 전부 시도·기각(비용/부수피해)
 *
 * 5가지 실험과 결과 (2026-07-21, temperature 0 반복 실행 시 재현됨):
 *   실험 1 (같은 물음 내 다른 루브릭 오염) — 물음1은 루브릭 3개를 한 호출에서 함께 채점한다.
 *     문제의 루브릭("재산가치 증가사유 발생 요건")만 단독으로 담은 미니 물음으로 떼어내 채점.
 *     → 물음 전체(3개 루브릭) 3/3 [met]  vs  루브릭 단독 격리 1.5/3 [partially_met].
 *     즉 원인은 같은 물음 안 다른(완전한) 루브릭들이 만드는 "이 답안은 충실하다"는 인상 전이 —
 *     버그#10과 동일 계열이나 한 단계 더 미세한 "루브릭 단위" 오염(물음 단위 격리로는 못 잡음).
 *   실험 2 (thinkingBudget 부족) — 물음1 전체 호출에서 thinkingBudget만 1024→8192로 상향.
 *     → 물음1은 1.5/3으로 우연히 고쳐지나(실험 4에서 물음3엔 일반화 안 됨 확인) 신뢰 불가.
 *   실험 3 (국소적 요소분해 유도) — 전역 스키마 변경 없이 물음1 호출에만 자유 텍스트
 *     elementBreakdown 필드(요소별 답안 존재 여부 점검)를 추가. → 여전히 3/3 [met]이고,
 *     모델이 "5년 이내 요건 있음(인용:'재산을 취득한 날로부터 5년 이내에')"라고 답안에 없는
 *     문구를 스스로 지어냄(confabulation). README 실험④가 실패한 근본 원인으로 판단 —
 *     구조적 요소분해 강제는 정직한 누락 보고가 아니라 확신에 찬 오판을 유도한다.
 *   실험 4 (thinkingBudget 일반화 검증) — 물음3 "판례 법리"(수치가 아닌 법리 문장 누락)에
 *     thinkingBudget 1024/8192 모두 적용. → 둘 다 4/4 [met] 불변, 게다가 evidenceQuote가
 *     "사안의 포섭" 루브릭 문장을 끌어와 오인용. 실험 2 효과는 일반화되지 않음 → 기각.
 *   실험 5 (루브릭 격리 일반화 검증) — 물음3 "판례 법리"만 단독 격리. → 2/4 [partially_met].
 *     실험 1의 결과가 물음3에도 재현 → "루브릭 단위 격리"가 두 케이스 모두 고치는 유일한 수단.
 *
 * 결론: 원인은 프롬프트 문구가 아니라 "물음 내 다중 루브릭 컨텍스트 오염". 유일하게 재현
 * 가능한 해결책은 루브릭 단위 독립 호출이나, 호출 수가 (물음 개수)→(루브릭 개수)로 늘어 비용·
 * 503 노출도가 커져 비용 효율이 맞지 않아 채택하지 않음(알려진 한계로 수용). 상세는 README 참고.
 *
 * 실행 (CTA_tax_law 디렉터리):
 *   npx -y tsx tests/investigate-rule8-leniency.ts
 */
import { GoogleGenAI, Type } from '@google/genai'
import { gradeProblem } from '../src/lib/gemini/gradeProblem'
import type { ProblemWithDetails } from '../src/types/db'
import type { SubquestionAnswer } from '../src/types/grading'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const kw = (words: string[]) => words as unknown as Record<string, unknown>

// ── gradeProblem.ts와 100% 동일한 시스템 프롬프트를 그대로 복사한다(수정 코드와 검증 코드가
//    같은 버그를 공유하지 않도록 재구현하는 tests/README.md 원칙에 따름) ──
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

// SUBQUESTION_SCHEMA + 실험3용 자유 텍스트 사고 필드(elementBreakdown) 추가.
// README 실험④의 elementCheck(루브릭 결과 항목 안의 강제 필드)와 다르게, 이건 "물음 전체
// 응답의 최상위" 필드로 둬서 특정 루브릭의 status/awardedScore 판정 로직 자체를 구조적으로
// 바꾸지 않고 순수하게 "먼저 요소를 적어보게" 만드는 효과만 노린다.
const SUBQUESTION_SCHEMA_WITH_BREAKDOWN = {
    type: Type.OBJECT,
    properties: {
        elementBreakdown: {
            type: Type.STRING,
            description:
                '채점을 시작하기 전에, 각 채점 기준의 설명에 등장하는 핵심 요건(특히 수치·기한·법적 절차 요건)을 ' +
                '개별 요소로 나열하고, 그 요소가 답안에 실제로 있는지 없는지를 요소별로 짧게 점검하세요. ' +
                '예: "기준 X: 요소① 있음(인용:...) / 요소② 없음". 이 필드는 사고 과정 기록용이며 최종 점수 판단에 ' +
                '그대로 반영해야 합니다(여기서 "없음"이라고 적은 요소는 rubricResults에서 만점 사유가 될 수 없습니다).',
        },
        number: { type: Type.NUMBER, description: '물음 번호' },
        awardedScore: { type: Type.NUMBER, description: '획득 점수' },
        maxScore: { type: Type.NUMBER, description: '배점' },
        feedback: { type: Type.STRING, description: '물음별 피드백 (공백 포함 150자 이내)' },
        rubricResults: { type: Type.ARRAY, items: RUBRIC_RESULT_SCHEMA },
    },
    required: ['elementBreakdown', 'number', 'awardedScore', 'maxScore', 'feedback', 'rubricResults'],
}

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

function buildSubquestionBlock(sq: ProblemWithDetails['cta_subquestion'][number], answerText: string | undefined): string {
    const rubrics = sq.cta_subquestion_rubric
        .sort((a, b) => a.display_order - b.display_order)
        .map((r) => {
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

// gradeProblem.ts의 generateContentWithRetry를 그대로 복사(503 등 일시 오류 재시도) — 이 진단
// 스크립트는 gradeProblem 내부 함수를 import하지 않고 독립 재구현한다는 tests/README.md 원칙 유지
async function generateWithRetry(
    params: Parameters<typeof ai.models.generateContent>[0]
): ReturnType<typeof ai.models.generateContent> {
    const RETRYABLE = new Set([429, 500, 502, 503, 504])
    for (let attempt = 0; ; attempt++) {
        try {
            return await ai.models.generateContent(params)
        } catch (err) {
            const e = err as { status?: number }
            if (!e?.status || !RETRYABLE.has(e.status) || attempt >= 6) throw err
            const backoff = Math.floor(Math.random() * Math.min(500 * 2 ** attempt, 15000))
            console.warn(`  [재시도] ${e.status} 오류, ${backoff}ms 후 재시도 (${attempt + 1}/6)`)
            await new Promise((r) => setTimeout(r, backoff))
        }
    }
}

interface RawResult {
    number: number
    awardedScore: number
    maxScore: number
    feedback: string
    rubricResults: { criterionName: string; evidenceQuote: string; status: string; awardedScore: number; maxScore: number }[]
    elementBreakdown?: string
}

async function callRaw(
    problem: ProblemWithDetails,
    sq: ProblemWithDetails['cta_subquestion'][number],
    answerText: string,
    opts: { thinkingBudget: number; withBreakdown: boolean }
): Promise<RawResult> {
    const userPrompt = buildFixedOverhead(problem) + buildSubquestionBlock(sq, answerText)
    const response = await generateWithRetry({
        model: 'gemini-2.5-flash-lite',
        contents: userPrompt,
        config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0,
            thinkingConfig: { thinkingBudget: opts.thinkingBudget },
            responseSchema: opts.withBreakdown ? SUBQUESTION_SCHEMA_WITH_BREAKDOWN : SUBQUESTION_SCHEMA,
        },
    })
    const text = response.text
    if (!text) throw new Error('빈 응답')
    return JSON.parse(text) as RawResult
}

function reportRubric(label: string, result: RawResult, criterionName: string, breakdown?: boolean) {
    const rr = result.rubricResults.find((r) => r.criterionName === criterionName)
    console.log(`\n[${label}]`)
    if (breakdown && result.elementBreakdown) {
        console.log(`  elementBreakdown: ${result.elementBreakdown}`)
    }
    if (!rr) {
        console.log(`  "${criterionName}": (결과 없음 — criterionName 불일치 가능)`)
        console.log(`  실제 반환된 기준명들: ${result.rubricResults.map((r) => r.criterionName).join(', ')}`)
        return
    }
    console.log(`  "${criterionName}": ${rr.awardedScore}/${rr.maxScore} [${rr.status}]`)
    console.log(`  근거: "${rr.evidenceQuote}"`)
}

// ── 문제1 물음1 데이터 (verify-grading.ts problem1.cta_subquestion[0]과 동일) ──
const RUBRIC_A = {
    id: 111,
    subquestion_id: 11,
    criterion_name: '수증자 및 재산 취득사유 요건',
    max_score: 3,
    required: true,
    display_order: 1,
    description_display:
        '직업, 연령, 소득 및 재산상태로 보아 자신의 계산과 자력으로 해당 행위를 할 수 없다고 인정되는 자(미성년자 등)가 다음 중 어느 하나의 사유로 재산을 취득해야 한다. ① 특수관계인으로부터 재산을 증여받은 경우 ② 특수관계인으로부터 기업의 경영 등에 관하여 공표되지 아니한 내부 정보를 제공받아 그 정보와 관련된 재산을 유상으로 취득한 경우 ③ 특수관계인으로부터 증여받거나 차입한 자금, 또는 특수관계인의 재산을 담보로 차입한 자금으로 재산을 취득한 경우',
    description_compact: '자력으로 재산 취득이 어려운 자가 특수관계인 관련 사유로 재산을 취득해야 함',
    keywords_json: kw(['미성년자', '특수관계인', '증여', '내부정보', '차입금']),
    example_answer_text:
        '자력으로 해당 행위를 할 수 없다고 인정되는 자가 특수관계인으로부터 증여받거나 내부정보를 제공받아 재산을 취득하는 등 법정 사유로 재산을 취득해야 한다.',
}
const RUBRIC_B = {
    id: 112,
    subquestion_id: 11,
    criterion_name: '재산가치 증가사유 발생 요건',
    max_score: 3,
    required: true,
    display_order: 2,
    description_display:
        '해당 재산을 취득한 날로부터 5년 이내에 객관적으로 예정된 재산가치 증가사유가 발생해야 한다. ① 개발사업의 시행, 형질변경, 공유물 분할, 지하수 개발·이용권 등 사업의 인가·허가 ② 비상장주식의 한국금융투자협회(K-OTC) 등록 ③ 주식 등을 코넥스시장에 상장하는 경우 ④ 그 밖에 위와 유사한 것으로서 재산가치를 증가시키는 사유',
    description_compact: '취득일로부터 5년 이내에 법정 재산가치 증가사유가 발생해야 함',
    keywords_json: kw(['5년 이내', '개발사업', '형질변경', 'K-OTC', '코넥스']),
    example_answer_text: '재산을 취득한 날부터 5년 이내에 개발사업의 시행 등 법정 재산가치 증가사유가 발생해야 한다.',
}
const RUBRIC_C = {
    id: 113,
    subquestion_id: 11,
    criterion_name: '기준금액 이상의 이익 획득 요건',
    max_score: 3,
    required: true,
    display_order: 3,
    description_display:
        '수증자(미성년자 등)가 재산가치 증가사유로 인하여 얻은 경제적 이익이 다음 중 어느 하나에 해당해야 한다. ① 재산가치상승금액이 3억 원 이상인 경우 ② 해당 재산의 취득가액과 통상적인 가치상승분 및 가치상승기여분의 합계액의 30% 이상인 경우',
    description_compact: '재산가치상승금액 3억 이상 또는 취득가액 대비 30% 이상 이익이어야 함',
    keywords_json: kw(['3억 원', '30%', '재산가치상승금액']),
    example_answer_text: '재산가치상승금액이 3억 원 이상이거나 취득가액 대비 30% 이상이어야 한다.',
}

const SUBQUESTION_1_FULL = {
    id: 11,
    problem_id: 1,
    number: 1,
    score: 9,
    display_order: 1,
    prompt_text_full:
        '「상속세 및 증여세법」상 재산 취득 후 재산가치 증가에 따른 이익의 증여 과세가 적용되기 위한 3가지 요건(① 수증자 및 재산 취득사유 요건, ② 재산가치 증가사유 발생 요건, ③ 기준금액 이상의 이익 획득 요건)을 구체적으로 설명하시오.',
    prompt_text_compact: '재산 취득 후 재산가치 증가이익 증여 과세의 3가지 요건을 설명하시오.',
    cta_subquestion_rubric: [RUBRIC_A, RUBRIC_B, RUBRIC_C],
}

// 실험 1용: 문제의 루브릭(재산가치 증가사유 발생 요건) 하나만 담은 미니 물음 (배점도 그 루브릭만큼으로 축소)
const SUBQUESTION_1_ISOLATED = {
    id: 11,
    problem_id: 1,
    number: 1,
    score: 3,
    display_order: 1,
    prompt_text_full: '「상속세 및 증여세법」상 재산 취득 후 재산가치 증가에 따른 이익의 증여 과세가 적용되기 위한 "재산가치 증가사유 발생 요건"을 구체적으로 설명하시오.',
    prompt_text_compact: '재산가치 증가사유 발생 요건을 설명하시오.',
    cta_subquestion_rubric: [RUBRIC_B],
}

function makeProblem(subquestions: typeof SUBQUESTION_1_FULL[]): ProblemWithDetails {
    return {
        id: 1,
        subject_id: 4,
        title: '재산가치 증가이익의 증여',
        total_score: subquestions.reduce((s, sq) => s + sq.score, 0),
        case_text_full:
            '거주자 甲은 아버지로부터 현금을 증여받아, 비상장 내국법인 (주)A의 유상증자에 참여하여 (주)A의 주식 40%를 취득하였다. ' +
            '(주)A는 주된 사업 확장을 위하여 다음과 같은 두 가지 프로젝트를 진행하였다. ' +
            '[프로젝트 1] (주)A는 소유하고 있던 일반 부지에 대규모 석유화학공장 건설을 완료하고, 관할 지자체로부터 공장 시운전 동의를 받아 본격적인 제품 생산을 시작하였다. ' +
            '[프로젝트 2] (주)A가 소유하고 있던 또 다른 유휴 토지가 정부의 대규모 신도시 개발구역으로 지정·고시되어 본격적인 도시개발사업이 시행되었다. ' +
            '위 [프로젝트 1]의 공장 가동과 [프로젝트 2]의 신도시 개발사업 시행으로 인하여 (주)A의 기업가치는 급상승하였고, 결과적으로 甲이 보유한 (주)A 주식의 가치 역시 취득 당시보다 막대하게 폭등하여 기준금액 이상의 막대한 이익이 발생하였다. ' +
            "과세관청 처분(또는 쟁점): 관할 세무서장은 [프로젝트 1]과 [프로젝트 2]가 모두 「상속세 및 증여세법」상 '개발사업의 시행' 등 재산가치증가사유에 해당한다고 보아, 甲이 얻은 주식가치 상승분 전체에 대하여 증여세를 부과·고지하였다.",
        case_text_compact:
            '甲은 아버지로부터 증여받은 현금으로 비상장법인 (주)A 주식 40%를 취득했다. ' +
            '이후 (주)A의 일반 부지에 석유화학공장을 완공·가동했고, 별도 유휴 토지는 신도시 개발구역으로 지정·고시되어 개발사업이 시행되었다. ' +
            '과세관청은 주식가치 상승분 전체에 증여세를 부과했다.',
        issue_text_full:
            "과세관청 처분(또는 쟁점): 관할 세무서장은 [프로젝트 1]과 [프로젝트 2]가 모두 「상속세 및 증여세법」상 '개발사업의 시행' 등 재산가치증가사유에 해당한다고 보아, 甲이 얻은 주식가치 상승분 전체에 대하여 증여세를 부과·고지하였다. 이에 대하여 甲은 ① \"석유화학공장 완공은 법령상 개발사업의 시행이 아니며\", ② \"개발사업이 시행된 것은 '(주)A 소유의 토지'일 뿐, 본인이 취득한 재산인 '(주)A의 주식' 자체가 아니므로 직접성이 결여되어 과세할 수 없다\"고 주장하며 조세심판을 청구하였다.",
        issue_text_compact:
            '과세관청은 공장 완공과 신도시 개발을 재산가치증가사유로 보아 주식가치 상승분 전체에 증여세를 부과했고, 甲은 공장 완공의 개발사업 해당성 및 토지와 주식의 비동일성을 이유로 과세에 불복하였다.',
        created_at: null,
        problem_type: 'case',
        cta_subquestion: subquestions,
    }
}

// 물음1 PARTIAL 답안 (verify-grading.ts PARTIAL_ANSWERS[1]과 동일 — "5년 이내" 통째로 삭제)
const ANSWER_PARTIAL =
    '재산 취득 후 재산가치 증가에 따른 이익의 증여로 과세되려면 다음 세 요건을 모두 갖추어야 한다. ' +
    '첫째, 수증자 및 취득사유 요건으로서 직업·연령·소득 및 재산상태로 보아 자신의 계산과 자력으로 해당 행위를 할 수 없다고 인정되는 자(미성년자 등)가, 특수관계인으로부터 재산을 증여받거나, 특수관계인으로부터 공표되지 아니한 내부정보를 제공받아 관련 재산을 유상으로 취득하거나, 특수관계인으로부터 증여·차입한 자금으로 재산을 취득하여야 한다. ' +
    '둘째, 재산가치 증가사유 발생 요건으로서 개발사업의 시행, 형질변경, 공유물 분할, 사업의 인가·허가, 비상장주식의 K-OTC 등록, 코넥스시장 상장 등 법정 재산가치 증가사유가 발생하여야 한다. ' +
    '셋째, 기준금액 이상의 이익 획득 요건으로서 그로 인해 얻은 재산가치상승금액이 3억 원 이상이거나, 취득가액과 통상적인 가치상승분 및 가치상승기여분 합계액의 30% 이상이어야 한다.'

// 실험1용: 위 답안에서 물음1 요건2에 해당하는 문장만 추출(다른 두 요건 문장 제거)
const ANSWER_PARTIAL_ISOLATED =
    '재산가치 증가사유 발생 요건으로서 개발사업의 시행, 형질변경, 공유물 분할, 사업의 인가·허가, 비상장주식의 K-OTC 등록, 코넥스시장 상장 등 법정 재산가치 증가사유가 발생하여야 한다.'

const TARGET = '재산가치 증가사유 발생 요건'

async function main() {
    console.log('='.repeat(70))
    console.log('실험 1: 같은 물음 안 다른(완전한) 루브릭이 오염을 일으키는가?')
    console.log('  1a) 기존 아키텍처 그대로: 물음1 전체(루브릭 3개, gradeProblem 경유)')
    console.log('  1b) 문제 루브릭만 단독 물음으로 격리(다른 루브릭 아예 없음)')
    console.log('='.repeat(70))

    const problemFull = makeProblem([SUBQUESTION_1_FULL])
    const answersFull: SubquestionAnswer[] = [{ subquestionNumber: 1, answerText: ANSWER_PARTIAL }]
    const resultFull = await gradeProblem(problemFull, answersFull)
    const sq1 = resultFull.subquestions.find((s) => s.number === 1)
    const rrFull = sq1?.rubricResults.find((r) => r.criterionName === TARGET)
    console.log(`\n[1a 물음 전체(3개 루브릭)]`)
    console.log(`  "${TARGET}": ${rrFull?.awardedScore}/${rrFull?.maxScore} [${(rrFull as unknown as { status?: string })?.status}]`)
    console.log(`  근거: "${(rrFull as unknown as { evidenceQuote?: string })?.evidenceQuote}"`)

    const isolatedResult = await callRaw(
        makeProblem([SUBQUESTION_1_ISOLATED]),
        SUBQUESTION_1_ISOLATED,
        ANSWER_PARTIAL_ISOLATED,
        { thinkingBudget: 1024, withBreakdown: false }
    )
    reportRubric('1b 루브릭 단독 격리(thinkingBudget=1024, 기본과 동일 설정)', isolatedResult, TARGET)

    console.log('\n' + '='.repeat(70))
    console.log('실험 2: thinkingBudget을 1024 → 8192로 올리면 결과가 바뀌는가?')
    console.log('(물음1 전체, 3개 루브릭 — 실제 운영 경로와 동일한 컨텍스트 크기)')
    console.log('='.repeat(70))

    const r2a = await callRaw(problemFull, SUBQUESTION_1_FULL, ANSWER_PARTIAL, { thinkingBudget: 1024, withBreakdown: false })
    reportRubric('2a thinkingBudget=1024 (기본값)', r2a, TARGET)

    const r2b = await callRaw(problemFull, SUBQUESTION_1_FULL, ANSWER_PARTIAL, { thinkingBudget: 8192, withBreakdown: false })
    reportRubric('2b thinkingBudget=8192', r2b, TARGET)

    console.log('\n' + '='.repeat(70))
    console.log('실험 3: 전역 스키마 변경 없이, 이 호출에만 자유 텍스트 요소분해 필드를 추가하면?')
    console.log('(README 실험④는 "루브릭 결과 안에" status 판정을 강제하는 elementCheck를 넣어 무관한')
    console.log(' OR형 루브릭까지 오염시켰음 — 여기서는 최상위에 사고과정 필드만 추가, 판정 스키마는 불변)')
    console.log('='.repeat(70))

    const r3 = await callRaw(problemFull, SUBQUESTION_1_FULL, ANSWER_PARTIAL, { thinkingBudget: 1024, withBreakdown: true })
    reportRubric('3 elementBreakdown 필드 추가', r3, TARGET, true)
    // 부수피해 확인: 완전한 답안인 다른 두 루브릭도 여전히 만점인지
    for (const other of ['수증자 및 재산 취득사유 요건', '기준금액 이상의 이익 획득 요건']) {
        const rr = r3.rubricResults.find((r) => r.criterionName === other)
        console.log(`  (부수피해 확인) "${other}": ${rr?.awardedScore}/${rr?.maxScore} [${rr?.status}]`)
    }

    console.log('\n' + '='.repeat(70))
    console.log('실험 4: thinkingBudget 효과가 물음3 "판례 법리"(수치 요건이 아닌 법리 요건 누락)에도')
    console.log('일반화되는가? — 물음1은 규칙 8이 예로 든 "수치" 요건이었지만, 이건 법리 문장 통째 누락')
    console.log('='.repeat(70))

    const TARGET_Q3 = '판례 법리'
    const RUBRIC_Q3_CONCLUSION = {
        id: 131, subquestion_id: 13, criterion_name: '결론', max_score: 2, required: true, display_order: 1,
        description_display: '간접적 이익은 과세할 수 없다는 甲의 주장은 타당하지 않다(과세할 수 있다).',
        description_compact: '간접적 이익도 과세 가능하므로 甲의 주장은 타당하지 않음',
        keywords_json: kw(['간접적 이익', '과세 가능', '주장 타당하지 않음']),
        example_answer_text: '간접적 이익은 과세할 수 없다는 甲의 주장은 타당하지 않다.',
    }
    const RUBRIC_Q3_LAW = {
        id: 132, subquestion_id: 13, criterion_name: TARGET_Q3, max_score: 4, required: true, display_order: 2,
        description_display:
            "대법원은 조세회피 방지라는 입법취지를 고려할 때, 재산가치증가사유의 직접적 대상이 되는 재산(토지)과 수증자가 취득한 재산(주식)이 반드시 동일해야 한다고 볼 필요는 없다고 판시하였다. 개발사업 등으로 인하여 법인의 재산가치가 상승하였고, 그에 따라 주주가 보유주식의 가치상승이라는 이익을 얻었으며, 두 사실 사이에 실질적인 '인과관계'가 인정된다면 주주 개인이 얻은 간접적인 경제적 이익도 해당 조항의 증여세 과세대상에 포함된다.",
        description_compact: '재산 동일성 불요, 법인 가치 상승과 주식가치 상승 사이 인과관계 있으면 간접 이익도 과세',
        keywords_json: kw(['인과관계', '주식가치 상승', '간접적 이익', '과세대상']),
        example_answer_text:
            '대법원은 직접 대상 재산과 취득 재산이 반드시 같아야 하는 것은 아니며, 법인의 재산가치 상승과 주식가치 상승 사이에 실질적 인과관계가 있으면 간접적 경제이익도 과세대상에 포함된다고 본다.',
    }
    const RUBRIC_Q3_SUBSUMPTION = {
        id: 133, subquestion_id: 13, criterion_name: '사안의 포섭', max_score: 3, required: true, display_order: 3,
        description_display:
            '사안에서 (주)A 소유 토지의 신도시 개발구역 지정 및 사업 시행으로 인하여 (주)A의 기업가치가 상승하였고, 그 결과 甲이 보유한 주식가치가 폭등하였으므로 두 사실 사이의 명확한 인과관계가 인정된다. 따라서 직접 대상 재산이 아니라는 형식적인 이유만으로 과세를 부정할 수 없다.',
        description_compact: '신도시 개발로 법인 가치와 주식가치가 상승해 인과관계 인정',
        keywords_json: kw(['신도시 개발', '기업가치 상승', '주식가치 폭등', '인과관계']),
        example_answer_text:
            '(주)A 소유 토지의 신도시 개발구역 지정 및 사업 시행으로 법인 가치가 상승하고 그 결과 甲의 주식가치가 폭등했으므로, 명확한 인과관계가 인정되어 과세할 수 있다.',
    }
    const SUBQUESTION_3_FULL = {
        id: 13, problem_id: 1, number: 3, score: 9, display_order: 3,
        prompt_text_full:
            '위 <사실관계>의 [프로젝트 2]와 같이 재산가치증가사유가 발생한 직접적인 대상(법인 소유 토지)과 수증자가 당초 취득한 재산(주식)이 일치하지 않는 경우, 주식가치 상승이라는 간접적 이익에 대하여는 증여세를 과세할 수 없다는 甲의 주장이 타당한지 대법원 판례의 태도(인과관계 등)에 근거하여 논리적으로 판단하시오.',
        prompt_text_compact: '토지 개발로 인한 주식가치 상승의 간접이익에 대한 증여세 과세 가능성과 甲의 주장을 판단하시오.',
        cta_subquestion_rubric: [RUBRIC_Q3_CONCLUSION, RUBRIC_Q3_LAW, RUBRIC_Q3_SUBSUMPTION],
    }
    // verify-grading.ts PARTIAL_ANSWERS[3]과 동일 — "인과관계 인정 시 간접이익도 과세대상 포함" 문장 통째 삭제
    const ANSWER_Q3_PARTIAL =
        '간접적 이익은 과세할 수 없다는 甲의 주장은 타당하지 않다. ' +
        '대법원은 조세회피 방지라는 입법취지를 고려할 때 재산가치증가사유의 직접적 대상인 재산(토지)과 수증자가 취득한 재산(주식)이 반드시 동일할 필요는 없다고 본다. ' +
        '사안에서 (주)A 소유 토지가 신도시 개발구역으로 지정되어 개발사업이 시행됨으로써 (주)A의 기업가치가 상승하였고 그 결과 甲의 주식가치가 폭등하였으므로 명확한 인과관계가 인정된다. 따라서 재산이 동일하지 않다는 형식적 이유만으로 과세를 부정할 수 없어 甲의 주장은 타당하지 않다.'

    const problemQ3 = makeProblem([SUBQUESTION_3_FULL as unknown as typeof SUBQUESTION_1_FULL])
    const r4a = await callRaw(problemQ3, SUBQUESTION_3_FULL as unknown as typeof SUBQUESTION_1_FULL, ANSWER_Q3_PARTIAL, { thinkingBudget: 1024, withBreakdown: false })
    reportRubric('4a 물음3 "판례 법리" thinkingBudget=1024', r4a, TARGET_Q3)
    const r4b = await callRaw(problemQ3, SUBQUESTION_3_FULL as unknown as typeof SUBQUESTION_1_FULL, ANSWER_Q3_PARTIAL, { thinkingBudget: 8192, withBreakdown: false })
    reportRubric('4b 물음3 "판례 법리" thinkingBudget=8192', r4b, TARGET_Q3)

    console.log('\n' + '='.repeat(70))
    console.log('실험 5: 물음3 "판례 법리"도 물음1처럼 루브릭 단독 격리로 고쳐지는가?')
    console.log('='.repeat(70))
    const SUBQUESTION_Q3_ISOLATED = {
        id: 13, problem_id: 1, number: 3, score: 4, display_order: 1,
        prompt_text_full: '대법원 판례가 재산가치증가사유의 직접적 대상 재산과 수증자 취득 재산의 동일성 요부에 대해 어떤 법리를 취하는지 서술하시오.',
        prompt_text_compact: '판례의 법리를 서술하시오.',
        cta_subquestion_rubric: [RUBRIC_Q3_LAW],
    }
    // ANSWER_Q3_PARTIAL에서 "판례 법리"에 해당하는 문장만 추출 (결론·사안의 포섭 문장 제거)
    const ANSWER_Q3_LAW_ISOLATED =
        '대법원은 조세회피 방지라는 입법취지를 고려할 때 재산가치증가사유의 직접적 대상인 재산(토지)과 수증자가 취득한 재산(주식)이 반드시 동일할 필요는 없다고 본다.'
    const r5 = await callRaw(
        makeProblem([SUBQUESTION_Q3_ISOLATED as unknown as typeof SUBQUESTION_1_FULL]),
        SUBQUESTION_Q3_ISOLATED as unknown as typeof SUBQUESTION_1_FULL,
        ANSWER_Q3_LAW_ISOLATED,
        { thinkingBudget: 1024, withBreakdown: false }
    )
    reportRubric('5 물음3 판례법리 단독 격리(다른 루브릭 없음)', r5, TARGET_Q3)

    console.log('\n' + '='.repeat(70))
    console.log('요약')
    console.log('='.repeat(70))
    const verdict = (r: RawResult | undefined, label: string, target = TARGET) => {
        const rr = r?.rubricResults.find((x) => x.criterionName === target)
        console.log(`  ${label}: ${rr ? `${rr.awardedScore}/${rr.maxScore} [${rr.status}]` : '(N/A)'}`)
    }
    console.log(`  1a 물음 전체(3개 루브릭, 기존 경로): ${rrFull?.awardedScore}/${rrFull?.maxScore} [${(rrFull as unknown as { status?: string })?.status}]`)
    verdict(isolatedResult, '1b 루브릭 단독 격리          ')
    verdict(r2a, '2a thinkingBudget=1024        ')
    verdict(r2b, '2b thinkingBudget=8192        ')
    verdict(r3, '3  elementBreakdown 추가       ')
    verdict(r4a, '4a 물음3 thinkingBudget=1024  ', TARGET_Q3)
    verdict(r4b, '4b 물음3 thinkingBudget=8192  ', TARGET_Q3)
    verdict(r5, '5  물음3 루브릭 단독 격리      ', TARGET_Q3)
    console.log('\n기대(물음1): 시기 요건(5년 이내)이 완전히 빠졌으므로 정상이라면 partially_met + 0<점수<3.')
    console.log('기대(물음3): 인과관계 법리 문장이 통째로 빠졌으므로 정상이라면 partially_met + 0<점수<4.')
}

main().catch((err) => {
    console.error('스크립트 실행 오류:', err)
    process.exit(1)
})
