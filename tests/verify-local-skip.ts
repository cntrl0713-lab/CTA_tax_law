/**
 * verify-local-skip.ts — 로컬 스킵(0점 처리) 회귀 검증 스위트
 *
 * 서버의 gradeProblem이 길이 미달·반복 문자 답안을 AI 호출 없이 정확하게
 * 0점 처리하고, _diagnostics.skippedSubquestions에 기록하는지 검증한다.
 * API 키 불필요 (스킵 경로만 테스트).
 *
 * 참고: 실행 시 "API key should be set" 경고가 2줄 출력되지만, 이는 GoogleGenAI
 * 생성자 초기화 시점의 SDK 경고일 뿐 실제 API 호출은 발생하지 않는다 (정상).
 *
 * 실행:
 *   npx tsx tests/verify-local-skip.ts
 */
import { gradeProblem } from '../src/lib/gemini/gradeProblem'
import { isLocallySkippable, MIN_GRADABLE_ANSWER_LENGTH, MIN_UNIQUE_CHARS } from '../src/lib/grading-skip'
import type { ProblemWithDetails } from '../src/types/db'

// ── 공용 픽스처 ──

const mockProblem = {
    id: 9999, subject_id: 1, problem_type: 'theory' as const,
    title: '스킵 검증용 더미 문제', total_score: 10,
    case_text_full: null, case_text_compact: null,
    issue_text_full: null, issue_text_compact: null,
    created_at: null,
    cta_subquestion: [
        {
            id: 9901, problem_id: 9999, number: 1, score: 5, display_order: 1,
            prompt_text_full: '물음1', prompt_text_compact: '물음1',
            cta_subquestion_rubric: [{
                id: 9801, subquestion_id: 9901, criterion_name: '기준A',
                max_score: 5, required: true, display_order: 1,
                description_display: null, description_compact: null,
                example_answer_text: null, keywords_json: null
            }]
        },
        {
            id: 9902, problem_id: 9999, number: 2, score: 5, display_order: 2,
            prompt_text_full: '물음2', prompt_text_compact: '물음2',
            cta_subquestion_rubric: [{
                id: 9802, subquestion_id: 9902, criterion_name: '기준B',
                max_score: 5, required: true, display_order: 1,
                description_display: null, description_compact: null,
                example_answer_text: null, keywords_json: null
            }]
        }
    ]
} satisfies ProblemWithDetails

// ── 어서션 유틸 ──

let passCount = 0
let failCount = 0

function assert(condition: boolean, label: string) {
    if (condition) {
        passCount++
        console.log(`  ✓ ${label}`)
    } else {
        failCount++
        console.error(`  ✗ FAIL: ${label}`)
    }
}

// ── 1. isLocallySkippable 단위 테스트 (공용 모듈) ──

function testIsLocallySkippable() {
    console.log('\n=== 1. isLocallySkippable 단위 테스트 ===')

    // 경계값: 정확히 15자
    const exact15 = '가'.repeat(MIN_GRADABLE_ANSWER_LENGTH)
    assert(isLocallySkippable(exact15).skip === true, `정확히 ${MIN_GRADABLE_ANSWER_LENGTH}자 → skip (too_short)`)
    const r15 = isLocallySkippable(exact15)
    assert(r15.skip && r15.reason === 'too_short', '사유가 too_short')

    // 경계값: 16자이면서 유니크 >= 5
    const chars16unique = '가나다라마바사아자차카타파하가나' // 16자, 유니크 14종
    assert(isLocallySkippable(chars16unique).skip === false, '16자 + 유니크 14종 → 통과')

    // 경계값: 16자이면서 유니크 < 5 (반복 문자)
    const chars16repeat = '가'.repeat(16)
    const r16rep = isLocallySkippable(chars16repeat)
    assert(r16rep.skip === true, '16자 + 유니크 1종 → skip')
    assert(r16rep.skip && r16rep.reason === 'repetitive', '사유가 repetitive')

    // 경계값: 유니크 정확히 5종 → 통과
    const unique5 = '가나다라마가나다라마가나다라마마' // 16자, 유니크 5종
    assert(isLocallySkippable(unique5).skip === false, '16자 + 유니크 정확히 5종 → 통과')

    // 경계값: 유니크 4종 → 스킵
    const unique4 = '가나다라가나다라가나다라가나다라' // 16자, 유니크 4종
    assert(isLocallySkippable(unique4).skip === true, '16자 + 유니크 4종 → skip (repetitive)')

    // 빈 문자열
    assert(isLocallySkippable('').skip === true, '빈 문자열 → skip')
    assert(isLocallySkippable(undefined).skip === true, 'undefined → skip')

    // 공백만 있는 문자열
    assert(isLocallySkippable('                    ').skip === true, '공백 20자 → trim 후 0자 → skip')

    // 정상 답안
    const normal = '최저한세는 조세특례를 통해 세금을 전혀 내지 않는 문제를 방지하고 과세형평을 도모하기 위한 제도입니다.'
    assert(isLocallySkippable(normal).skip === false, '정상 답안 → 통과')

    // 숫자 위주 답안 (오탐 없음 확인)
    const numeric = '1,000,000×0.1=100,000'
    assert(isLocallySkippable(numeric).skip === false, '숫자 위주(유니크 6종 이상) → 통과')
}

// ── 2. gradeProblem 통합 테스트 (스킵 경로) ──

async function testGradeProblemSkip() {
    console.log('\n=== 2. gradeProblem 통합: 전부 단문 스킵 ===')
    const r1 = await gradeProblem(mockProblem, [
        { subquestionNumber: 1, answerText: '짧은답' },
        { subquestionNumber: 2, answerText: '짧은답2' },
    ])
    assert(r1.totalScore === 0, '전부 단문 → 총점 0')
    assert(r1.overallComment === '답안이 작성되지 않아 채점할 내용이 없습니다.', '고정 총평')
    assert(JSON.stringify(r1._diagnostics?.skippedSubquestions) === '[1,2]', 'skippedSubquestions=[1,2]')
    assert(r1.subquestions[0].feedback.includes('짧아'), '물음1 피드백에 "짧아" 포함')

    console.log('\n=== 3. gradeProblem 통합: 전부 반복 문자 스킵 ===')
    const r2 = await gradeProblem(mockProblem, [
        { subquestionNumber: 1, answerText: '가'.repeat(20) },
        { subquestionNumber: 2, answerText: '나'.repeat(16) },
    ])
    assert(r2.totalScore === 0, '전부 반복 → 총점 0')
    assert(r2.subquestions[0].feedback.includes('반복 문자'), '물음1 피드백에 "반복 문자" 포함')
    assert(r2.subquestions[1].feedback.includes('반복 문자'), '물음2 피드백에 "반복 문자" 포함')
    assert(JSON.stringify(r2._diagnostics?.skippedSubquestions) === '[1,2]', 'skippedSubquestions=[1,2]')

    console.log('\n=== 4. gradeProblem 통합: 혼합 사유 스킵 (repetitive + too_short) ===')
    // 두 물음 모두 스킵이지만 사유가 다른(repetitive vs too_short) 경우를 검증.
    // "스킵 + 정상 채점" 공존 경로는 API 호출이 필요하므로 실데이터 E2E로 커버.
    const r3 = await gradeProblem(mockProblem, [
        { subquestionNumber: 1, answerText: '가'.repeat(20) }, // repetitive
        { subquestionNumber: 2, answerText: '' },              // too_short
    ])
    assert(r3.totalScore === 0, '혼합 스킵 → 총점 0')
    assert(r3.subquestions[0].feedback.includes('반복 문자'), '물음1(반복) 피드백 정확')
    assert(r3.subquestions[1].feedback.includes('짧아'), '물음2(단문) 피드백 정확')
    assert(JSON.stringify(r3._diagnostics?.skippedSubquestions) === '[1,2]', '둘 다 스킵 기록')

    console.log('\n=== 5. 루브릭 결과 구조 검증 ===')
    // 스킵된 물음의 루브릭이 정확한 구조를 갖추는지
    const sq1 = r1.subquestions[0]
    assert(sq1.rubricResults.length === 1, '물음1 루브릭 1개')
    assert(sq1.rubricResults[0].status === 'unmet', 'status가 unmet')
    assert(sq1.rubricResults[0].awardedScore === 0, 'awardedScore가 0')
    assert(sq1.rubricResults[0].evidenceQuote === '', 'evidenceQuote가 빈 문자열')
    assert(sq1.rubricResults[0].criterionName === '기준A', 'criterionName 보존')
}

// ── 실행 ──

async function main() {
    testIsLocallySkippable()
    await testGradeProblemSkip()

    console.log(`\n${'='.repeat(50)}`)
    console.log(`결과: ${passCount} PASS, ${failCount} FAIL`)
    if (failCount > 0) {
        process.exit(1)
    }
}

main().catch((err) => {
    console.error('예기치 않은 오류:', err)
    process.exit(1)
})
