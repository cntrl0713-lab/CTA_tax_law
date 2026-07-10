/**
 * 진단 스크립트 — 루브릭 배점이 3~5점일 때 부분점수(partially_met)가 실제로 어떤 값으로
 * 부여되는지 특성화(characterize)한다. 버그 조사가 아니라 "몰랐던 채점 동작 방식을 관찰"하는
 * 목적의 일회성 스크립트 — investigate-q3-strictness.ts와 같은 패턴(단일/소수 루브릭짜리
 * 미니 problem 즉석 구성)을 따른다. 정식 회귀 스위트가 아니므로 끝나면 지워도 된다.
 *
 * 1차 실험(배점 3/4/5, 내용 요소 개수가 서로 다름)에서 "배점이 클수록 만점 문턱이 높다"는
 * 가설을 세웠으나, 5점 루브릭만 유독 요구 요소 개수가 4개(3/4점 루브릭은 2~3개)였다는
 * 교란요인이 있었다. 2차 실험은 "내용(요소 개수)"과 "배점 숫자"를 분리한 대조군이다:
 *   - PART_A: 4점 루브릭과 동일한 내용(요소 3~4개, 압축된 문장에도 만점 나옴)을 배점만 5점으로 표시
 *   - PART_B: 5점 루브릭과 동일한 내용(요소 4개, 하나 빠지면 만점 안 나옴)을 배점만 3점으로 표시
 * 같은 문항을 배점만 바꿔 다시 던져서, 만점 문턱이 "배점 숫자"를 따라가는지 "내용"을 따라가는지 확인한다.
 *
 * 실행 (CTA_tax_law 디렉터리, GEMINI_API_KEY는 .env.local):
 *   npx -y tsx --env-file=.env.local tests/investigate-partial-credit.ts          # 1차 실험 (배점 3/4/5)
 *   npx -y tsx --env-file=.env.local tests/investigate-partial-credit.ts --control # 2차 대조군 (내용 vs 배점 분리)
 */
import { gradeProblem } from '../src/lib/gemini/gradeProblem'
import type { ProblemWithDetails } from '../src/types/db'
import type { SubquestionAnswer } from '../src/types/grading'

const kw = (words: string[]) => words as unknown as Record<string, unknown>

// ── 배점 3점: 문제51 물음1의 실제 DB 루브릭 (요소 2~3개: 결론+근거+포섭) ──
const RUBRIC_3PT = {
    id: 5112,
    subquestion_id: 1,
    criterion_name: '수시 세무조사의 적법성',
    max_score: 3,
    required: true,
    display_order: 1,
    description_display:
        "과세관청의 수시 세무조사 착수는 위법하다. 세무공무원은 적정하고 공평한 과세를 위해 '필요한 최소한의 범위'에서 세무조사를 실시해야 하므로, 법령이 정한 구체적이고 객관적인 탈루 혐의 자료 없이 단순한 의심만으로 조사를 개시하는 것은 조사권 남용에 해당한다.",
    description_compact: '구체적 자료 없이 단순 의심으로 시작한 수시조사는 조사권 남용으로 위법',
    keywords_json: kw(['수시 세무조사', '최소한의 범위', '조사권 남용', '구체적 자료']),
    example_answer_text:
        '구체적이고 객관적인 탈루 혐의 자료 없이 단순 의심만으로 수시 세무조사를 개시한 것은 조사권 남용으로 위법하다.',
}

// ── 배점 4점: 문제1 물음3의 실제 DB 루브릭 (요소 3~4개: 동일성불요+메커니즘+인과관계+결론, 압축 문장에도 만점) ──
const RUBRIC_4PT = {
    id: 132,
    subquestion_id: 2,
    criterion_name: '판례 법리',
    max_score: 4,
    required: true,
    display_order: 1,
    description_display:
        "대법원은 조세회피 방지라는 입법취지를 고려할 때, 재산가치증가사유의 직접적 대상이 되는 재산(토지)과 수증자가 취득한 재산(주식)이 반드시 동일해야 한다고 볼 필요는 없다고 판시하였다. 개발사업 등으로 인하여 법인의 재산가치가 상승하였고, 그에 따라 주주가 보유주식의 가치상승이라는 이익을 얻었으며, 두 사실 사이에 실질적인 '인과관계'가 인정된다면 주주 개인이 얻은 간접적인 경제적 이익도 해당 조항의 증여세 과세대상에 포함된다.",
    description_compact: '재산 동일성 불요, 법인 가치 상승과 주식가치 상승 사이 인과관계 있으면 간접 이익도 과세',
    keywords_json: kw(['인과관계', '주식가치 상승', '간접적 이익', '과세대상']),
    example_answer_text:
        '대법원은 직접 대상 재산과 취득 재산이 반드시 같아야 하는 것은 아니며, 법인의 재산가치 상승과 주식가치 상승 사이에 실질적 인과관계가 있으면 간접적 경제이익도 과세대상에 포함된다고 본다.',
}

// ── 배점 5점: 합성 루브릭 (요소 4개: 원칙+번복요건①+번복요건②+증명책임, 하나 빠지면 만점 안 나옴) ──
const RUBRIC_5PT = {
    id: 90001,
    subquestion_id: 3,
    criterion_name: '조세회피목적 추정의 번복 요건',
    max_score: 5,
    required: true,
    display_order: 1,
    description_display:
        '「상속세 및 증여세법」상 명의신탁재산의 증여의제 규정은 원칙적으로 조세회피 목적이 있는 것으로 추정된다. 그러나 납세자가 ① 명의신탁에 조세회피 목적이 아닌 뚜렷한 다른 목적이 있었다는 점과, ② 그 명의신탁으로 부수적으로 사소한 조세경감이 발생하였다는 사정만으로는 조세회피 목적이 있었다고 단정할 수 없다는 점을 증명하면 추정이 번복되어 증여세를 과세할 수 없다. 대법원은 이러한 증명책임이 원칙적으로 납세의무자에게 있다고 본다.',
    description_compact:
        '조세회피목적 추정 원칙, 뚜렷한 다른 목적 증명 시 번복, 사소한 조세경감만으로는 부족, 증명책임은 납세자',
    keywords_json: kw(['조세회피목적', '추정', '뚜렷한 다른 목적', '사소한 조세경감', '증명책임']),
    example_answer_text:
        '명의신탁재산의 증여의제는 조세회피목적이 있는 것으로 추정되나, 조세회피 목적이 아닌 뚜렷한 다른 목적이 있었고 부수적으로 사소한 조세경감이 있었던 것에 불과하다는 점을 납세자가 증명하면 추정이 번복되어 과세할 수 없다.',
}

// ── 2차 대조군: RUBRIC_4PT와 동일 내용, 배점만 5점으로 표시 ──
const RUBRIC_4PT_CONTENT_AS_5PT = { ...RUBRIC_4PT, id: 90002, max_score: 5, criterion_name: '판례 법리(배점 5점 버전, 내용은 4점 루브릭과 동일)' }

// ── 2차 대조군: RUBRIC_5PT와 동일 내용, 배점만 3점으로 표시 ──
const RUBRIC_5PT_CONTENT_AS_3PT = { ...RUBRIC_5PT, id: 90003, max_score: 3, criterion_name: '조세회피목적 추정의 번복 요건(배점 3점 버전, 내용은 5점 루브릭과 동일)' }

function makeMiniProblem(rubrics: [typeof RUBRIC_3PT, typeof RUBRIC_4PT, typeof RUBRIC_5PT]): ProblemWithDetails {
    return {
        id: 90000,
        subject_id: 1,
        title: '[진단용] 부분점수 granularity 관찰',
        total_score: rubrics.reduce((s, r) => s + r.max_score, 0),
        case_text_full: '(진단용 합성 문제 — 사실관계는 각 물음의 프롬프트에 직접 서술)',
        case_text_compact: '(진단용 합성 문제)',
        issue_text_full: '(진단용 합성 문제)',
        issue_text_compact: '(진단용 합성 문제)',
        created_at: null,
        cta_subquestion: [
            {
                id: 1,
                problem_id: 90000,
                number: 1,
                score: rubrics[0].max_score,
                display_order: 1,
                prompt_text_full:
                    '구체적 제보나 자료 없이 단순 의심만으로 수시 세무조사에 착수한 과세관청 조치의 적법성 여부를 판단하시오.',
                prompt_text_compact: '단순 의심에 의한 수시 세무조사 착수의 적법성을 판단하시오.',
                cta_subquestion_rubric: [rubrics[0]],
            },
            {
                id: 2,
                problem_id: 90000,
                number: 2,
                score: rubrics[1].max_score,
                display_order: 2,
                prompt_text_full:
                    '재산가치증가사유가 발생한 직접적 대상(법인 소유 토지)과 수증자가 취득한 재산(주식)이 일치하지 않는 경우, 간접적 이익에 증여세를 과세할 수 있는지 대법원 판례의 태도(인과관계 등)에 근거하여 설명하시오.',
                prompt_text_compact: '토지-주식 비동일성 사안에서 간접이익 과세 가능성에 대한 판례 법리를 설명하시오.',
                cta_subquestion_rubric: [rubrics[1]],
            },
            {
                id: 3,
                problem_id: 90000,
                number: 3,
                score: rubrics[2].max_score,
                display_order: 3,
                prompt_text_full:
                    '명의신탁재산의 증여의제 규정상 조세회피목적 추정이 번복되기 위한 요건을 대법원 판례에 근거하여 설명하시오.',
                prompt_text_compact: '명의신탁 증여의제의 조세회피목적 추정 번복 요건을 설명하시오.',
                cta_subquestion_rubric: [rubrics[2]],
            },
        ],
    }
}

interface CoverageLevel {
    label: string
    approxCoverage: string
    q1: string
    q2: string
    q3: string
}

const LEVELS: CoverageLevel[] = [
    {
        label: 'V0',
        approxCoverage: '0% (무관한 서술)',
        q1: '甲은 도매업을 운영하는 사업자이다.',
        q2: '주식은 토지와 다른 재산이다.',
        q3: '명의신탁을 하면 세금을 피할 수 있다고 알려져 있다.',
    },
    {
        label: 'V1',
        approxCoverage: '~25% (결론만 단언, 근거·포섭 없음)',
        q1: '이 사건 수시 세무조사는 위법하다고 생각한다.',
        q2: '판례는 재산이 반드시 같지 않아도 된다고 본다.',
        q3: '명의신탁을 하면 증여세가 과세될 수 있다고 생각한다.',
    },
    {
        label: 'V2',
        approxCoverage: '~50% (결론+근거 일부, 사안 포섭·세부요건 생략)',
        q1: '세무조사는 필요한 최소한의 범위에서 이루어져야 하므로, 이 사건 수시 세무조사는 위법하다.',
        q2: '대법원은 재산의 동일성이 꼭 필요한 것은 아니라고 보며, 법인의 가치가 올라가면 주주도 이익을 본다고 설명한다.',
        q3: '명의신탁재산은 원칙적으로 증여세가 과세되는 것으로 추정되지만, 다른 목적이 있었다면 과세되지 않을 수도 있다.',
    },
    {
        label: 'V3',
        approxCoverage: '~75% (대부분 서술, 일부 세부 표현 누락)',
        q1: '세무공무원은 최소한의 범위에서 세무조사를 해야 하는데, 구체적 자료 없이 조사를 시작한 것은 조사권 남용으로 위법하다고 본다.',
        q2: '대법원은 재산의 동일성이 반드시 필요한 것은 아니며, 법인 가치 상승과 주주의 주식가치 상승 사이에 인과관계가 인정되면 그 이익도 과세 대상이 된다고 본다.',
        q3: '명의신탁재산의 증여의제는 조세회피목적이 있는 것으로 추정되나, 조세회피 목적이 아닌 뚜렷한 다른 목적이 있었음을 증명하면 추정이 번복되어 과세되지 않는다. 이러한 증명은 납세자가 하여야 한다.',
    },
    {
        label: 'V4',
        approxCoverage: '100% (모범답안과 동등)',
        q1: RUBRIC_3PT.example_answer_text,
        q2: RUBRIC_4PT.example_answer_text,
        q3: RUBRIC_5PT.example_answer_text,
    },
]

async function runSweep(
    title: string,
    rubrics: [typeof RUBRIC_3PT, typeof RUBRIC_4PT, typeof RUBRIC_5PT],
    levels: CoverageLevel[]
) {
    const problem = makeMiniProblem(rubrics)
    console.log(`\n${'█'.repeat(70)}\n${title}\n${'█'.repeat(70)}`)

    const rows: { level: string; coverage: string; s3: string; s4: string; s5: string }[] = []

    for (const level of levels) {
        const answers: SubquestionAnswer[] = [
            { subquestionNumber: 1, answerText: level.q1 },
            { subquestionNumber: 2, answerText: level.q2 },
            { subquestionNumber: 3, answerText: level.q3 },
        ]
        const result = await gradeProblem(problem, answers)

        const fmt = (n: number) => {
            const sq = result.subquestions.find((s) => s.number === n)
            const rr = sq?.rubricResults[0]
            if (!rr) return '(없음)'
            const status = (rr as unknown as { status?: string }).status ?? '?'
            return `${rr.awardedScore}/${rr.maxScore} [${status}]`
        }

        console.log(`\n=== ${level.label}: ${level.approxCoverage} ===`)
        console.log(`  Q1(${rubrics[0].max_score}점, ${rubrics[0].criterion_name}) → ${fmt(1)}`)
        console.log(`  Q2(${rubrics[1].max_score}점, ${rubrics[1].criterion_name}) → ${fmt(2)}`)
        console.log(`  Q3(${rubrics[2].max_score}점, ${rubrics[2].criterion_name}) → ${fmt(3)}`)

        rows.push({ level: level.label, coverage: level.approxCoverage, s3: fmt(1), s4: fmt(2), s5: fmt(3) })
    }

    console.log('\n' + '─'.repeat(70))
    console.log(`[${title}] 요약`)
    console.log('─'.repeat(70))
    for (const r of rows) {
        console.log(`${r.level} (${r.coverage})\n  Q1: ${r.s3}\n  Q2: ${r.s4}\n  Q3: ${r.s5}`)
    }
}

async function main() {
    if (process.argv.includes('--control')) {
        // 2차 대조군: 내용(요소 개수)은 그대로 두고 배점 숫자만 바꿔서, 만점 문턱이
        // 배점 숫자를 따라가는지 내용을 따라가는지 확인. V2~V4만 돌려도 충분.
        await runSweep(
            '2차 대조군: Q2=4점내용을 5점배점으로, Q3=5점내용을 3점배점으로 (배점 숫자만 교체)',
            [RUBRIC_3PT, RUBRIC_4PT_CONTENT_AS_5PT, RUBRIC_5PT_CONTENT_AS_3PT],
            LEVELS.slice(2)
        )
        return
    }

    await runSweep('1차 실험: 배점 3/4/5, 각 루브릭 원래 내용 그대로', [RUBRIC_3PT, RUBRIC_4PT, RUBRIC_5PT], LEVELS)
}

main().catch((err) => {
    console.error('스크립트 실행 오류:', err)
    process.exit(1)
})
