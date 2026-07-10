/**
 * 진단 스크립트 — 문제 22 물음2 "결론" 루브릭(3점)이 모범답안(example_answer_text)을
 * 그대로 제출했음에도 2/3(met)으로 감점된 사례가 재현되는지, 정당한 엄격함인지 버그인지 판별
 *
 * 배경: verify-extra.ts strong 모드 실행 결과, 물음2 답안이 "결론"/"제도의 취지"/"판례 법리 포섭"
 * 세 루브릭의 example_answer_text를 순서대로 이어붙인 것임에도 "결론"이 2/3 [met]으로 채점됨.
 * status='met'인데 만점이 아닌 것은 시스템 프롬프트 규칙 6("완전히 충족했으면 met")과 모순되며,
 * 기존 유령 근거(findPhantomEvidence/findSuppressedEvidence) 로직은 "근거 인용문이 답안에
 * 실존하는가"만 검증하고 "met인데 왜 만점이 아닌가"는 검증하지 않으므로 자동 교정 대상이 아니었음.
 *
 * 4가지 실험:
 *   A. 재현성: 동일 답안(물음1+물음2) 3회 반복 실행 → "결론"이 매번 2/3인지
 *   B. 결론 문장 단독 제출: 물음2 답안에서 "결론" 문장만 남기고 나머지 두 문장을 제거해도
 *      2/3인지 (다른 두 기준 문장과 함께 있어서 인상이 흐려지는지 확인)
 *   C. 물음1 제외(단독 채점): 물음2만 단독으로 채점해도 2/3인지 (다른 물음과 묶여 채점될 때
 *      "전반적으로 부족하다"는 인상이 전이되는지 확인 — investigate-q3-strictness.ts의 실험 C와 동일 가설)
 *   D. 문장 순서 변경: "결론" 문장을 맨 앞이 아니라 맨 뒤(제도의 취지·판례 법리 다음)에 배치해도
 *      2/3인지 (IRAC 순서상 "근거 없이 결론부터 던진다"는 인상 때문에 감점되는지 확인)
 *
 * 실행 (CTA_tax_law 디렉터리, GEMINI_API_KEY는 .env.local):
 *   npx -y tsx --env-file=.env.local tests/investigate-q22-conclusion.ts
 */
import { gradeProblem } from '../src/lib/gemini/gradeProblem'
import type { ProblemWithDetails } from '../src/types/db'
import type { SubquestionAnswer } from '../src/types/grading'

const kw = (words: string[]) => words as unknown as Record<string, unknown>

const RUBRIC_CONCLUSION = {
    id: 2221,
    subquestion_id: 222,
    criterion_name: '결론',
    max_score: 3,
    required: true,
    display_order: 1,
    description_display: '과세관청의 증액 경정처분은 납세자의 절차적 권리를 침해한 것으로 위법하다(적법하지 않다).',
    description_compact: '처분은 절차적 권리침해로 위법',
    keywords_json: kw(['위법', '절차적 권리침해']),
    example_answer_text: '과세관청의 증액 경정처분은 납세자의 절차적 권리를 침해하여 위법하다.',
}

const RUBRIC_PURPOSE = {
    id: 2222,
    subquestion_id: 222,
    criterion_name: '제도의 취지',
    max_score: 4,
    required: true,
    display_order: 2,
    description_display:
        '과세예고통지와 과세전적부심사 제도는 납세자의 권리 침해를 사전에 방지하기 위한 핵심적인 사전 권리구제 수단이므로, 이를 생략할 수 있는 예외사유는 엄격하게 해석하여야 한다.',
    description_compact: '사전 권리구제 수단으로서 예외사유는 엄격해석 필요',
    keywords_json: kw(['사전 권리구제', '엄격해석', '과세예고통지', '과세전적부심사']),
    example_answer_text: '과세예고통지와 과세전적부심사는 납세자의 사전 권리구제를 위한 핵심 제도이므로 그 예외사유는 엄격하게 해석되어야 한다.',
}

const RUBRIC_APPLICATION = {
    id: 2223,
    subquestion_id: 222,
    criterion_name: '판례 법리 포섭',
    max_score: 5,
    required: true,
    display_order: 3,
    description_display:
        "법령상 '부과제척기간 만료일까지의 기간이 3개월 이하인 경우'를 예외사유로 두고 있으나, 대법원에 따르면 과세관청이 정당한 사유 없이 스스로 과세행정을 장기간 해태(방치)하여 제척기간 만료가 임박해진 경우에는 예외사유로 인정될 수 없다. 따라서 이를 근거로 납세자의 절차적 권리를 원천적으로 박탈하고 이루어진 과세처분은 절차상 중대하고 명백한 하자가 있어 위법하다.",
    description_compact: '과세관청의 장기간 방치로 제척기간 임박시 예외사유 불인정, 처분은 절차상 하자로 위법',
    keywords_json: kw(['과세행정 해태', '장기간 방치', '예외사유 불인정', '절차상 하자']),
    example_answer_text:
        '과세관청이 정당한 사유 없이 3년 10개월간 과세자료를 방치하여 제척기간 만료가 임박해진 경우에는 예외사유로 인정되지 않으므로, 이를 이유로 사전절차를 생략한 처분은 절차상 중대·명백한 하자로 위법하다.',
}

const SUBQUESTION_2 = {
    id: 222,
    problem_id: 22,
    number: 2,
    score: 12,
    display_order: 2,
    prompt_text_full:
        '위 <사실관계>에서 과세관청이 부과제척기간 만료가 임박하였다는 이유를 들어 과세예고통지 및 과세전적부심사 절차를 모두 생략하고 부과처분을 강행한 행위가 적법한지 여부를 대법원 판례의 태도에 근거하여 논리적으로 판단하시오.',
    prompt_text_compact: '제척기간 만료 임박을 이유로 사전절차를 생략한 부과처분의 적법성을 판례에 근거해 판단하시오.',
    cta_subquestion_rubric: [RUBRIC_CONCLUSION, RUBRIC_PURPOSE, RUBRIC_APPLICATION],
}

const SUBQUESTION_1 = {
    id: 221,
    problem_id: 22,
    number: 1,
    score: 8,
    display_order: 1,
    prompt_text_full: '「국세기본법」상 과세관청이 납세자에게 과세예고통지를 생략할 수 있고, 납세자가 과세전적부심사를 청구할 수 없는 법정 예외 사유를 4가지 서술하시오.',
    prompt_text_compact: '과세예고통지 생략 및 과세전적부심사 청구 제외 예외사유 4가지를 서술하시오.',
    cta_subquestion_rubric: [
        {
            id: 2211,
            subquestion_id: 221,
            criterion_name: '예외 사유 1',
            max_score: 2,
            required: true,
            display_order: 1,
            description_display: '「국세징수법」상 납부기한 전 징수 사유가 있거나 세법상 수시부과 사유가 있는 경우.',
            description_compact: '납부기한 전 징수 또는 수시부과 사유',
            keywords_json: kw(['납부기한 전 징수', '수시부과']),
            example_answer_text: '납부기한 전 징수 사유나 수시부과 사유가 있는 경우에는 과세예고통지를 생략할 수 있다.',
        },
        {
            id: 2212,
            subquestion_id: 221,
            criterion_name: '예외 사유 2',
            max_score: 2,
            required: true,
            display_order: 2,
            description_display: '「조세범 처벌법」 위반으로 고발 또는 통고처분하는 경우.',
            description_compact: '조세범 처벌법 위반 고발·통고처분',
            keywords_json: kw(['조세범 처벌법', '고발', '통고처분']),
            example_answer_text: '조세범 처벌법 위반으로 고발 또는 통고처분하는 경우에는 예외사유에 해당한다.',
        },
        {
            id: 2213,
            subquestion_id: 221,
            criterion_name: '예외 사유 3',
            max_score: 2,
            required: true,
            display_order: 3,
            description_display: '세무조사 결과 통지 및 과세예고통지를 하는 날부터 국세부과 제척기간 만료일까지의 기간이 3개월 이하인 경우.',
            description_compact: '제척기간 만료일까지 3개월 이하인 경우',
            keywords_json: kw(['제척기간 만료', '3개월 이하']),
            example_answer_text: '과세예고통지일부터 제척기간 만료일까지의 기간이 3개월 이하인 경우에는 생략할 수 있다.',
        },
        {
            id: 2214,
            subquestion_id: 221,
            criterion_name: '예외 사유 4',
            max_score: 2,
            required: true,
            display_order: 4,
            description_display: '조세조약에 따라 상대국과 상호합의절차가 진행 중인 경우, 또는 불복청구나 과세전적부심사청구에 따른 재조사결정의 이행을 위하여 처분하는 경우.',
            description_compact: '상호합의절차 진행 중이거나 재조사결정 이행을 위한 처분인 경우',
            keywords_json: kw(['상호합의절차', '재조사결정', '불복청구']),
            example_answer_text: '조세조약에 따른 상호합의절차가 진행 중이거나 재조사결정의 이행을 위한 처분인 경우에도 예외사유에 해당한다.',
        },
    ],
}

function makeProblem22(subquestions: typeof SUBQUESTION_1[]): ProblemWithDetails {
    return {
        id: 22,
        subject_id: 1,
        title: '과세예고통지 생략과 절차적 권리침해',
        total_score: subquestions.reduce((s, sq) => s + sq.score, 0),
        case_text_full:
            '내국법인 (주)A는 2019 사업연도(1.1.~12.31.)에 대한 법인세 과세표준 및 세액을 법정신고기한인 2020년 3월 31일에 적법하게 신고·납부하였다. ' +
            '관할 지방국세청장은 2021년 5월경 (주)A의 거래처에 대한 세무조사를 실시하는 과정에서, (주)A가 2019 사업연도에 거액의 매출을 누락한 명백한 과세자료를 확보하여 관할 세무서장에게 통보하였다. ' +
            '관할 세무서장은 해당 과세자료를 통보받고도 별다른 추가 조사나 내부 검토를 진행하지 않은 채, 아무런 정당한 사유 없이 약 3년 10개월 동안 이를 방치하였다. ' +
            '2025년 3월 15일, 관할 세무서장은 (주)A의 2019 사업연도 법인세 부과제척기간 만료일(2025년 3월 31일)이 불과 보름 남짓 남았다는 사실을 뒤늦게 인지하였다.',
        case_text_compact:
            '(주)A는 2019 사업연도 법인세를 적법 신고하였으나, 2021년 5월경 매출누락 과세자료가 확보되었음에도 세무서장이 3년 10개월간 방치하여 부과제척기간 만료가 임박하였다.',
        issue_text_full:
            "관할 세무서장은 부과제척기간 만료가 임박하였다는 이유로, 「국세기본법」에 따른 '과세예고통지'를 생략하고 (주)A에게 과세전적부심사 청구 기회를 부여하지 않은 채, 2025년 3월 15일 (주)A에게 2019 사업연도 법인세 5억 원을 증액 경정·고지하였다.",
        issue_text_compact: '과세관청은 제척기간 만료 임박을 이유로 과세예고통지와 과세전적부심사 절차를 생략하고 법인세를 증액 경정·고지하였다.',
        created_at: null,
        cta_subquestion: subquestions,
    }
}

const ANSWER_Q1 =
    '납부기한 전 징수 사유나 수시부과 사유가 있는 경우에는 과세예고통지를 생략할 수 있다. 조세범 처벌법 위반으로 고발 또는 통고처분하는 경우에는 예외사유에 해당한다. ' +
    '과세예고통지일부터 제척기간 만료일까지의 기간이 3개월 이하인 경우에는 생략할 수 있다. 조세조약에 따른 상호합의절차가 진행 중이거나 재조사결정의 이행을 위한 처분인 경우에도 예외사유에 해당한다.'

// 원본 버그 사례: 세 루브릭의 example_answer_text를 결론 → 제도의 취지 → 판례 법리 포섭 순으로 이어붙임
const ANSWER_Q2_ORIGINAL =
    RUBRIC_CONCLUSION.example_answer_text + ' ' + RUBRIC_PURPOSE.example_answer_text + ' ' + RUBRIC_APPLICATION.example_answer_text

// 실험 B: 결론 문장만 단독 제출 (제도의 취지·판례 법리 문장 제거)
const ANSWER_Q2_CONCLUSION_ONLY = RUBRIC_CONCLUSION.example_answer_text

// 실험 D: 결론 문장을 맨 뒤로 이동 (제도의 취지 → 판례 법리 포섭 → 결론)
const ANSWER_Q2_REORDERED =
    RUBRIC_PURPOSE.example_answer_text + ' ' + RUBRIC_APPLICATION.example_answer_text + ' ' + RUBRIC_CONCLUSION.example_answer_text

async function gradeAndReport(
    label: string,
    problem: ProblemWithDetails,
    q2Answer: string,
    includeQ1: boolean
): Promise<void> {
    const answers: SubquestionAnswer[] = includeQ1
        ? [
              { subquestionNumber: 1, answerText: ANSWER_Q1 },
              { subquestionNumber: 2, answerText: q2Answer },
          ]
        : [{ subquestionNumber: 2, answerText: q2Answer }]

    const result = await gradeProblem(problem, answers)
    const sq2 = result.subquestions.find((s) => s.number === 2)
    const conclusion = sq2?.rubricResults.find((r) => r.criterionName === '결론')

    console.log(`\n[${label}]`)
    console.log(`  물음2 답안: "${q2Answer.slice(0, 70)}${q2Answer.length > 70 ? '...' : ''}"`)
    if (conclusion) {
        const status = (conclusion as unknown as { status?: string }).status
        const quote = (conclusion as unknown as { evidenceQuote?: string }).evidenceQuote
        console.log(`  결론: ${conclusion.awardedScore}/${conclusion.maxScore} [${status}]`)
        if (quote) console.log(`  근거 인용: "${quote}"`)
    } else {
        console.log('  결론: (결과 없음)')
    }
    console.log(`  물음2 피드백: ${sq2?.feedback}`)
}

async function main() {
    const problemFull = makeProblem22([SUBQUESTION_1, SUBQUESTION_2])
    const problemQ2Only = makeProblem22([SUBQUESTION_2])

    console.log('=== 실험 A: 재현성 (원본 답안 3회 반복, 물음1 포함) ===')
    for (let i = 1; i <= 3; i++) {
        await gradeAndReport(`A-${i}`, problemFull, ANSWER_Q2_ORIGINAL, true)
    }

    console.log('\n=== 실험 B: 결론 문장만 단독 제출 (물음1 포함) ===')
    await gradeAndReport('B-결론단독', problemFull, ANSWER_Q2_CONCLUSION_ONLY, true)

    console.log('\n=== 실험 C: 물음2 단독 채점 (물음1 제외, 원본 답안) ===')
    await gradeAndReport('C-원본답안 (단독)', problemQ2Only, ANSWER_Q2_ORIGINAL, false)

    console.log('\n=== 실험 D: 결론 문장을 맨 뒤로 이동 (물음1 포함) ===')
    await gradeAndReport('D-순서변경', problemFull, ANSWER_Q2_REORDERED, true)
}

main().catch((err) => {
    console.error('스크립트 실행 오류:', err)
    process.exit(1)
})
