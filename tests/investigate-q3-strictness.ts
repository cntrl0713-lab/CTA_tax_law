/**
 * 진단 스크립트 — 문제 51 물음3 "처분의 적법성" 0점 사례가 정당한 엄격함인지 실제 버그인지 판별
 *
 * 배경: strong 모드에서 학생 답안이 정확한 근거("사전통지와 과세예고통지 절차를 생략했으므로...위법하다")를
 * 인용했음에도 "처분의 적법성"(4점)이 0점(unmet) 처리됨. 산술/유령근거 버그는 아니므로 별도 조사.
 *
 * 4가지 실험:
 *   A. 재현성: 동일 답안 3회 반복 실행 → 매번 0점인지
 *   B. 모범답안 자체 테스트: 루브릭 작성자의 example_answer_text를 그대로 제출해도 0점인지
 *      (0점이면 채점 기준 자체의 버그 — 학생 답안 문제가 아님)
 *   C. 단독 채점: 물음3만 단독으로(물음1·2 없이) 채점해도 0점인지 (다른 물음과 묶여 채점될 때
 *      "전반적으로 부족하다"는 인상이 전이되는지 확인)
 *   D. 답안 강화: "절차적 권리를 침해했다"는 문구를 명시적으로 추가하면 점수가 오르는지
 *      (오르면 정당한 엄격함, 안 오르면 버그에 가까움)
 *
 * 실행 (CTA_tax_law 디렉터리, GEMINI_API_KEY는 .env.local):
 *   npx -y tsx --env-file=.env.local tests/investigate-q3-strictness.ts
 */
import { gradeProblem } from '../src/lib/gemini/gradeProblem'
import type { ProblemWithDetails } from '../src/types/db'
import type { SubquestionAnswer } from '../src/types/grading'

const kw = (words: string[]) => words as unknown as Record<string, unknown>

const RUBRIC_JUDGE_CRITERIA = {
    id: 5131,
    subquestion_id: 513,
    criterion_name: '별도 세무조사 판단 기준',
    max_score: 4,
    required: true,
    display_order: 1,
    description_display:
        "대법원은 거래상대방 질문조사 과정에서 거래상대방에게 과세요건 사실에 대한 진술을 강요하여 '영업의 자유나 사생활의 자유가 침해될 염려'가 있는 경우에는, 단순한 참고인 조사를 넘어선 거래상대방에 대한 별도의 세무조사에 해당한다고 본다.",
    description_compact: '과세요건 진술 강요로 영업·사생활 자유 침해 우려가 있으면 별도 세무조사',
    keywords_json: kw(['거래상대방', '과세요건 사실', '영업의 자유', '사생활의 자유']),
    example_answer_text: '거래상대방에게 과세요건 사실에 대한 진술을 강요해 영업의 자유나 사생활의 자유가 침해될 염려가 있으면 별도의 세무조사에 해당한다.',
}

const RUBRIC_LEGALITY = {
    id: 5132,
    subquestion_id: 513,
    criterion_name: '처분의 적법성',
    max_score: 4,
    required: true,
    display_order: 2,
    description_display:
        '과세관청의 처분은 위법하다. 乙에 대한 조사는 실질적인 별도의 세무조사에 해당함에도 과세관청이 사전통지나 과세예고통지 등의 절차를 누락하여 납세자의 절차적 권리를 중대하게 침해하였으므로 처분은 위법하다.',
    description_compact: '실질적 세무조사인데 사전통지·과세예고통지 누락으로 처분 위법',
    keywords_json: kw(['사전통지', '과세예고통지', '절차적 권리', '처분 위법']),
    example_answer_text: '乙에 대한 조사는 실질적인 세무조사에 해당하는데도 사전통지와 과세예고통지를 생략했으므로 과세처분은 위법하다.',
}

const SUBQUESTION_3 = {
    id: 513,
    problem_id: 51,
    number: 3,
    score: 8,
    display_order: 3,
    prompt_text_full:
        "거래상대방인 乙에 대한 강도 높은 질문조사가 「국세기본법」에 따른 별도의 '세무조사'에 해당하는지에 대한 대법원 판례의 판단 기준을 설명하고, 세무조사 사전통지 및 과세예고통지 등 절차를 생략한 채 乙에게 종합소득세를 부과한 처분이 적법한지 논리적 근거를 들어 서술하시오.",
    prompt_text_compact: '거래상대방 질문조사가 별도 세무조사인지와 절차 생략 처분의 적법성을 서술하시오.',
    cta_subquestion_rubric: [RUBRIC_JUDGE_CRITERIA, RUBRIC_LEGALITY],
}

const SUBQUESTION_1 = {
    id: 511,
    problem_id: 51,
    number: 1,
    score: 7,
    display_order: 1,
    prompt_text_full:
        '「국세기본법」상 과세관청이 납세자의 성실성 추정을 배제하고 수시 세무조사를 할 수 있는 법정 사유를 2가지 이상 열거하고, 구체적 자료 없이 단순 의심만으로 수시 세무조사에 착수한 과세관청의 조치에 대한 적법성 여부를 판단하시오.',
    prompt_text_compact: '성실성 추정 배제 사유와 단순 의심에 의한 수시 세무조사의 적법성을 판단하시오.',
    cta_subquestion_rubric: [
        {
            id: 5111,
            subquestion_id: 511,
            criterion_name: '성실성 추정 배제 사유',
            max_score: 4,
            required: true,
            display_order: 1,
            description_display:
                '다음 중 2가지 이상 기재 시 4점, 1가지만 기재 시 2점: ① 납세협력의무(신고, 세금계산서 발급 등) 이행 누락 ② 무자료·위장·가공거래 등 거래내용이 사실과 다른 혐의 ③ 납세자에 대한 구체적인 탈세제보 ④ 신고내용에 탈루나 오류의 혐의를 인정할 만한 명백한 자료 등',
            description_compact: '납세협력의무 누락, 사실과 다른 거래, 탈세제보, 명백한 자료 등',
            keywords_json: kw(['납세협력의무', '무자료거래', '탈세제보', '명백한 자료']),
            example_answer_text: '성실성 추정 배제 사유로는 납세협력의무 이행 누락, 무자료·위장·가공거래, 구체적인 탈세제보, 신고내용에 대한 명백한 탈루 자료 등이 있다.',
        },
        {
            id: 5112,
            subquestion_id: 511,
            criterion_name: '수시 세무조사의 적법성',
            max_score: 3,
            required: true,
            display_order: 2,
            description_display:
                "과세관청의 수시 세무조사 착수는 위법하다. 세무공무원은 적정하고 공평한 과세를 위해 '필요한 최소한의 범위'에서 세무조사를 실시해야 하므로, 법령이 정한 구체적이고 객관적인 탈루 혐의 자료 없이 단순한 의심만으로 조사를 개시하는 것은 조사권 남용에 해당한다.",
            description_compact: '구체적 자료 없이 단순 의심으로 시작한 수시조사는 조사권 남용으로 위법',
            keywords_json: kw(['수시 세무조사', '최소한의 범위', '조사권 남용', '구체적 자료']),
            example_answer_text: '구체적이고 객관적인 탈루 혐의 자료 없이 단순 의심만으로 수시 세무조사를 개시한 것은 조사권 남용으로 위법하다.',
        },
    ],
}

const SUBQUESTION_2 = {
    id: 512,
    problem_id: 51,
    number: 2,
    score: 8,
    display_order: 2,
    prompt_text_full:
        "예외적으로 동일한 과세기간에 대한 중복조사(재조사)가 허용되는 '조세탈루 혐의를 인정할 만한 명백한 자료'의 의미를 대법원 판례의 입장에 따라 설명하고, 위 엑셀 파일이 과거 금융조사로 충분히 확인 가능했던 자료이므로 명백한 자료가 아니라는 甲 주장의 타당성(재조사의 적법성)을 논리적으로 논하시오.",
    prompt_text_compact: '명백한 자료의 의미와 엑셀 파일에 근거한 재조사의 적법성을 판단하시오.',
    cta_subquestion_rubric: [
        {
            id: 5121,
            subquestion_id: 512,
            criterion_name: '명백한 자료의 의미',
            max_score: 4,
            required: true,
            display_order: 1,
            description_display:
                '예외적으로 재조사가 허용되는 명백한 자료란 조세탈루 사실에 대한 개연성이 객관성과 합리성 있는 자료에 의해 상당한 정도로 인정되어야 하며, 종전 세무조사에서 이미 조사된 자료가 아닌 외부에서 별도로 확보된 신규성(비중복성)을 갖춘 자료여야 한다.',
            description_compact: '객관적·합리적 개연성을 갖춘 신규 자료만 명백한 자료',
            keywords_json: kw(['조세탈루', '객관성', '합리성', '신규성', '비중복성']),
            example_answer_text: '명백한 자료란 조세탈루 개연성이 객관성과 합리성이 있는 자료로 상당히 인정되고, 종전 조사자료와 중복되지 않는 신규 자료여야 한다.',
        },
        {
            id: 5122,
            subquestion_id: 512,
            criterion_name: '재조사의 적법성',
            max_score: 4,
            required: true,
            display_order: 2,
            description_display:
                '甲 주장은 타당하지 않다. 해당 엑셀 파일은 검찰 압수수색이라는 별도 절차로 비로소 확보된 신규성 있는 자료이며, 구체적인 자금흐름이 상세히 기록되어 객관성과 합리성을 갖추었으므로 재조사가 허용되는 명백한 자료에 해당한다.',
            description_compact: '압수수색으로 확보된 신규·구체 자료이므로 재조사 적법',
            keywords_json: kw(['압수수색', '차명계좌', '신규성', '구체적 자금흐름']),
            example_answer_text: '검찰 압수수색으로 확보된 차명계좌 엑셀 파일은 신규성 있는 구체적 자료이므로, 재조사를 허용하는 명백한 자료에 해당한다.',
        },
    ],
}

function makeProblem51(subquestions: typeof SUBQUESTION_1[]): ProblemWithDetails {
    return {
        id: 51,
        subject_id: 1,
        title: '세무조사권 남용과 한계',
        total_score: subquestions.reduce((s, sq) => s + sq.score, 0),
        case_text_full:
            '도매업을 영위하는 개인사업자 甲은 최근 신용카드 지출액이 신고 소득 대비 과다하다는 과세관청의 내부 분석에 따라, 구체적 제보나 자료 없이 단순 의심만으로 수시 세무조사 대상자로 선정되어 조사를 받았다. ' +
            "조사 진행 중 과세관청은 과거 무혐의로 종결되었던 甲의 2021년 귀속분에 대하여 재조사에 착수하였다. 그 근거는 최근 검찰이 별건 압수수색을 통해 확보하여 과세관청에 통보한 '차명계좌 상세 자금흐름 엑셀 파일'이었다. " +
            "한편, 과세관청 소속 세무공무원은 甲에 대한 세무조사 과정에서 甲의 주요 거래처인 A법인의 부사장 乙을 '조사대상자의 거래관련인(참고인)' 자격으로 세무서에 출석하도록 요구하였다. " +
            '세무공무원은 乙을 상대로 단순한 거래사실 확인을 넘어 수입 누락 경위, 자금의 개인적 사용처, 세금 회피 목적 유무 등을 장시간 강도 높게 질문조사하였고, 나아가 乙의 개인 이메일 및 업무 메모까지 확보하여 과세요건을 직접 검토하였다. ' +
            '과세관청 처분: 관할 세무서장은 재조사 결과를 바탕으로 甲에게 2021년 귀속 종합소득세를 증액 경정·고지하였다. ' +
            '또한 관할 세무서장은 乙의 부과제척기간 만료일이 임박했다는 이유로 세무조사 사전통지 및 과세예고통지(과세전적부심사 기회) 등 관련 절차를 일체 생략한 채, 乙에게 종합소득세를 전격적으로 증액 경정·고지하였다.',
        case_text_compact:
            '개인사업자 甲은 내부분석만으로 수시 세무조사 대상이 되었고, 과거 무혐의 종결된 2021년분은 검찰이 압수수색으로 확보해 통보한 차명계좌 엑셀 파일을 근거로 재조사되었다 ' +
            '또 거래처 부사장 乙은 참고인 자격으로 출석했지만 실질적으로 강도 높은 조사와 자료확보가 이루어졌고, 사전통지 없이 종합소득세가 정경·고지되었다.',
        issue_text_full:
            '관할 세무서장은 재조사 결과를 바탕으로 甲에게 2021년 귀속 종합소득세를 증액 경정·고지하였다.\n' +
            '또한 관할 세무서장은 乙의 부과제척기간 만료일이 임박했다는 이유로 세무조사 사전통지 및 과세예고통지(과세전적부심사 기회) 등 관련 절차를 일체 생략한 채, 乙에게 종합소득세를 전격적으로 증액 경정·고지하였다.',
        issue_text_compact:
            '甲에 대한 재조사 결과로 종합소득세가 경정되었고, 乙에 대해서는 사전통지와 과세예고통지 없이 종합소득세가 경정·고지되었다.',
        created_at: null,
        cta_subquestion: subquestions,
    }
}

const ANSWER_Q1 =
    '성실성 추정 배제 사유로는 납세협력의무 이행 누락, 무자료·위장·가공거래 혐의, 구체적인 탈세제보, 신고내용에 탈루나 오류를 인정할 만한 명백한 자료가 있는 경우 등이 있다. ' +
    '이 사건에서 신용카드 지출액 과다라는 단순 의심만으로는 위 법정 사유 중 어느 것에도 해당하지 않으므로, 구체적 자료 없이 착수한 수시 세무조사는 조사권 남용으로서 위법하다.'
const ANSWER_Q2 =
    '명백한 자료란 조세탈루 사실에 대한 개연성이 객관성과 합리성 있는 자료에 의해 상당한 정도로 인정되고, 종전 세무조사에서 이미 조사된 자료와 중복되지 않는 신규성을 갖춘 자료를 의미한다. ' +
    '이 사건 엑셀 파일은 검찰의 압수수색이라는 별도 절차를 통해 비로소 확보된 신규 자료이고 구체적 자금흐름이 상세히 기록되어 객관성과 합리성을 갖추었으므로 명백한 자료에 해당한다. 따라서 甲의 주장은 타당하지 않고 재조사는 적법하다.'

// 원래 buggy 사례의 물음3 답안 (버그 리포트 원문)
const ANSWER_Q3_ORIGINAL =
    '거래상대방에 대한 질문조사가 과세요건 사실에 관한 진술을 강요하여 거래상대방의 영업의 자유나 사생활의 자유를 침해할 염려가 있는 경우에는 단순한 참고인 조사를 넘어 거래상대방에 대한 별도의 세무조사에 해당한다. ' +
    '이 사건에서 乙에 대한 조사는 실질적으로 별도 세무조사인데도 사전통지와 과세예고통지 절차를 생략했으므로, 乙에 대한 종합소득세 경정·고지처분은 위법하다.'

// 실험 B: 두 루브릭의 example_answer_text를 그대로 이어붙인 "모범답안"
const ANSWER_Q3_MODEL =
    RUBRIC_JUDGE_CRITERIA.example_answer_text + ' ' + RUBRIC_LEGALITY.example_answer_text

// 실험 D: "절차적 권리 침해"를 명시적으로 추가한 강화 답안
const ANSWER_Q3_ENHANCED =
    '거래상대방에 대한 질문조사가 과세요건 사실에 관한 진술을 강요하여 거래상대방의 영업의 자유나 사생활의 자유를 침해할 염려가 있는 경우에는 단순한 참고인 조사를 넘어 거래상대방에 대한 별도의 세무조사에 해당한다. ' +
    '이 사건에서 乙에 대한 조사는 실질적으로 별도 세무조사인데도, 과세관청은 사전통지와 과세예고통지 절차를 생략하였다. 사전통지와 과세예고통지(과세전적부심사 기회)는 납세자의 핵심적인 절차적 권리인데, 세무조사에 해당함에도 이러한 절차를 일체 생략한 것은 납세자의 절차적 권리를 중대하게 침해한 것이다. ' +
    '따라서 乙에 대한 종합소득세 경정·고지처분은 절차적 하자로 인해 위법하다.'

async function gradeAndReport(
    label: string,
    problem: ProblemWithDetails,
    q3Answer: string,
    includeQ1Q2: boolean
): Promise<void> {
    const answers: SubquestionAnswer[] = includeQ1Q2
        ? [
              { subquestionNumber: 1, answerText: ANSWER_Q1 },
              { subquestionNumber: 2, answerText: ANSWER_Q2 },
              { subquestionNumber: 3, answerText: q3Answer },
          ]
        : [{ subquestionNumber: 3, answerText: q3Answer }]

    const result = await gradeProblem(problem, answers)
    const sq3 = result.subquestions.find((s) => s.number === 3)
    const legality = sq3?.rubricResults.find((r) => r.criterionName === '처분의 적법성')

    console.log(`\n[${label}]`)
    console.log(`  물음3 답안: "${q3Answer.slice(0, 60)}${q3Answer.length > 60 ? '...' : ''}"`)
    if (legality) {
        const status = (legality as unknown as { status?: string }).status
        const quote = (legality as unknown as { evidenceQuote?: string }).evidenceQuote
        console.log(`  처분의 적법성: ${legality.awardedScore}/${legality.maxScore} [${status}]`)
        if (quote) console.log(`  근거 인용: "${quote}"`)
    } else {
        console.log('  처분의 적법성: (결과 없음)')
    }
    console.log(`  물음3 피드백: ${sq3?.feedback}`)
}

async function main() {
    const problemFull = makeProblem51([SUBQUESTION_1, SUBQUESTION_2, SUBQUESTION_3])
    const problemQ3Only = makeProblem51([SUBQUESTION_3])

    console.log('=== 실험 A: 재현성 (동일 답안 3회 반복, 물음1·2 포함) ===')
    for (let i = 1; i <= 3; i++) {
        await gradeAndReport(`A-${i}`, problemFull, ANSWER_Q3_ORIGINAL, true)
    }

    console.log('\n=== 실험 B: 모범답안(example_answer_text) 그대로 제출 ===')
    await gradeAndReport('B (모범답안, 물음1·2 포함)', problemFull, ANSWER_Q3_MODEL, true)

    console.log('\n=== 실험 C: 물음3 단독 채점 (물음1·2 제외) ===')
    await gradeAndReport('C-원본답안 (단독)', problemQ3Only, ANSWER_Q3_ORIGINAL, false)
    await gradeAndReport('C-모범답안 (단독)', problemQ3Only, ANSWER_Q3_MODEL, false)

    console.log('\n=== 실험 D: 절차적 권리 침해를 명시한 강화 답안 (물음1·2 포함) ===')
    await gradeAndReport('D-강화답안', problemFull, ANSWER_Q3_ENHANCED, true)

    console.log('\n=== 실험 D-단독: 강화 답안, 물음3 단독 채점 ===')
    await gradeAndReport('D-강화답안 (단독)', problemQ3Only, ANSWER_Q3_ENHANCED, false)
}

main().catch((err) => {
    console.error('스크립트 실행 오류:', err)
    process.exit(1)
})
