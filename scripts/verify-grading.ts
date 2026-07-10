/**
 * 채점 로직 검증 스크립트 — 문제 1(재산가치 증가이익의 증여) / 문제 51(세무조사권 남용)
 *
 * 검증 항목:
 *   (1) 충실한 답안이 높은 점수를 받는지 (strong)
 *   (2) 불완전한 답안이 관대하게 채점되지 않는지 (incomplete)
 *   (3) 절반만 맞는 답안이 대략 절반 점수를 받는지 — 문제 1 전용 (half)
 *   (4) [공통, 모든 모드] 답안에 실존하는 표현을 "누락"으로 지적하는 허위 감점이 없는지
 *   (5) [공통, 모든 모드] 응답 내부 산술이 일관적인지: Σ루브릭점수===물음점수, Σ물음점수===총점
 *   (6) [공통, 모든 모드] met/partially_met + 0점 초과 루브릭마다 evidenceQuote가 답안에 실존하는지
 *       (유령 근거/점수 부풀림 탐지 — gradeProblem.ts 내부 함수를 재사용하지 않고 독립 재구현)
 *
 * 허위 누락 탐지는 특정 단어 하드코딩이 아니라, 피드백의 "'X' 누락/언급 없음" 패턴에서
 * X를 추출해 해당 물음 답안에 X가 실제로 존재하는지 정규화 후 대조하는 일반 로직을 사용.
 *
 * 실행 (CTA_tax_law 디렉터리, GEMINI_API_KEY는 .env.local):
 *   npx -y tsx --env-file=.env.local scripts/verify-grading.ts               # 문제1 충실한 답안 (기본)
 *   npx -y tsx --env-file=.env.local scripts/verify-grading.ts --incomplete   # 문제1 관대화 방지 확인
 *   npx -y tsx --env-file=.env.local scripts/verify-grading.ts --half         # 문제1 절반 답안 비례성 확인
 *   npx -y tsx --env-file=.env.local scripts/verify-grading.ts --problem51    # 문제51 회귀 확인 (강한 답안)
 *   npx -y tsx --env-file=.env.local scripts/verify-grading.ts --problem51 --incomplete # 문제51 관대화 방지
 */
import { gradeProblem } from '../src/lib/gemini/gradeProblem'
import type { ProblemWithDetails } from '../src/types/db'
import type { SubquestionAnswer } from '../src/types/grading'

// DB의 keywords_json은 실제로는 문자열 배열이지만 타입 정의가 Record라 캐스팅 필요
const kw = (words: string[]) => words as unknown as Record<string, unknown>

// ── 문제 1 데이터: cta_uploader/add_problem_1.py의 실제 업로드 값과 동일 ──
const problem1: ProblemWithDetails = {
    id: 1,
    subject_id: 4,
    title: '재산가치 증가이익의 증여',
    total_score: 25,
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
    cta_subquestion: [
        {
            id: 11,
            problem_id: 1,
            number: 1,
            score: 9,
            display_order: 1,
            prompt_text_full:
                '「상속세 및 증여세법」상 재산 취득 후 재산가치 증가에 따른 이익의 증여 과세가 적용되기 위한 3가지 요건(① 수증자 및 재산 취득사유 요건, ② 재산가치 증가사유 발생 요건, ③ 기준금액 이상의 이익 획득 요건)을 구체적으로 설명하시오.',
            prompt_text_compact: '재산 취득 후 재산가치 증가이익 증여 과세의 3가지 요건을 설명하시오.',
            cta_subquestion_rubric: [
                {
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
                },
                {
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
                },
                {
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
                },
            ],
        },
        {
            id: 12,
            problem_id: 1,
            number: 2,
            score: 7,
            display_order: 2,
            prompt_text_full:
                "위 <사실관계>의 [프로젝트 1]에 대하여, 과세관청이 '석유화학공장 완공'을 재산가치증가사유인 '개발사업의 시행'으로 보아 과세한 처분의 적법성 여부를 대법원 판례에 근거하여 논리적으로 판단하시오.",
            prompt_text_compact: '석유화학공장 완공이 개발사업의 시행인지 여부와 과세처분의 적법성을 판단하시오.',
            cta_subquestion_rubric: [
                {
                    id: 121,
                    subquestion_id: 12,
                    criterion_name: '결론',
                    max_score: 2,
                    required: true,
                    display_order: 1,
                    description_display: '공장 완공을 개발사업의 시행으로 본 과세관청의 처분은 위법하다(적법하지 않다).',
                    description_compact: '공장 완공은 개발사업의 시행이 아니므로 처분 위법',
                    keywords_json: kw(['공장 완공', '개발사업의 시행 아님', '처분 위법']),
                    example_answer_text: '석유화학공장 완공을 개발사업의 시행으로 본 과세관청의 처분은 위법하다.',
                },
                {
                    id: 122,
                    subquestion_id: 12,
                    criterion_name: '판례 법리',
                    max_score: 3,
                    required: true,
                    display_order: 2,
                    description_display:
                        "대법원은 '개발사업의 시행'을 적어도 개발구역 지정고시가 수반되어 토지를 개발하고 그 토지가치를 증가시키는 사업으로 엄격하게 해석한다.",
                    description_compact: '개발구역 지정고시가 수반된 토지개발사업으로 엄격하게 해석',
                    keywords_json: kw(['개발구역 지정고시', '토지개발', '엄격해석']),
                    example_answer_text:
                        '대법원은 개발사업의 시행을 개발구역 지정고시가 수반되어 토지를 개발하고 그 토지가치를 증가시키는 사업으로 엄격하게 해석한다.',
                },
                {
                    id: 123,
                    subquestion_id: 12,
                    criterion_name: '사안의 포섭',
                    max_score: 2,
                    required: true,
                    display_order: 3,
                    description_display:
                        '토지개발과 무관하게 단순히 일반 부지에 석유화학공장을 완공하고 생산을 개시한 사정만으로는 법령상 예정된 재산가치증가사유인 개발사업의 시행에 해당한다고 볼 수 없다.',
                    description_compact: '일반 부지에 공장 완공·생산 개시는 개발사업의 시행에 해당하지 않음',
                    keywords_json: kw(['일반 부지', '공장 완공', '생산 개시', '개발사업 아님']),
                    example_answer_text: '일반 부지에 석유화학공장을 완공하고 생산을 개시한 것만으로는 개발사업의 시행에 해당한다고 볼 수 없다.',
                },
            ],
        },
        {
            id: 13,
            problem_id: 1,
            number: 3,
            score: 9,
            display_order: 3,
            prompt_text_full:
                '위 <사실관계>의 [프로젝트 2]와 같이 재산가치증가사유가 발생한 직접적인 대상(법인 소유 토지)과 수증자가 당초 취득한 재산(주식)이 일치하지 않는 경우, 주식가치 상승이라는 간접적 이익에 대하여는 증여세를 과세할 수 없다는 甲의 주장이 타당한지 대법원 판례의 태도(인과관계 등)에 근거하여 논리적으로 판단하시오.',
            prompt_text_compact: '토지 개발로 인한 주식가치 상승의 간접이익에 대한 증여세 과세 가능성과 甲의 주장을 판단하시오.',
            cta_subquestion_rubric: [
                {
                    id: 131,
                    subquestion_id: 13,
                    criterion_name: '결론',
                    max_score: 2,
                    required: true,
                    display_order: 1,
                    description_display: '간접적 이익은 과세할 수 없다는 甲의 주장은 타당하지 않다(과세할 수 있다).',
                    description_compact: '간접적 이익도 과세 가능하므로 甲의 주장은 타당하지 않음',
                    keywords_json: kw(['간접적 이익', '과세 가능', '주장 타당하지 않음']),
                    example_answer_text: '간접적 이익은 과세할 수 없다는 甲의 주장은 타당하지 않다.',
                },
                {
                    id: 132,
                    subquestion_id: 13,
                    criterion_name: '판례 법리',
                    max_score: 4,
                    required: true,
                    display_order: 2,
                    description_display:
                        "대법원은 조세회피 방지라는 입법취지를 고려할 때, 재산가치증가사유의 직접적 대상이 되는 재산(토지)과 수증자가 취득한 재산(주식)이 반드시 동일해야 한다고 볼 필요는 없다고 판시하였다. 개발사업 등으로 인하여 법인의 재산가치가 상승하였고, 그에 따라 주주가 보유주식의 가치상승이라는 이익을 얻었으며, 두 사실 사이에 실질적인 '인과관계'가 인정된다면 주주 개인이 얻은 간접적인 경제적 이익도 해당 조항의 증여세 과세대상에 포함된다.",
                    description_compact: '재산 동일성 불요, 법인 가치 상승과 주식가치 상승 사이 인과관계 있으면 간접 이익도 과세',
                    keywords_json: kw(['인과관계', '주식가치 상승', '간접적 이익', '과세대상']),
                    example_answer_text:
                        '대법원은 직접 대상 재산과 취득 재산이 반드시 같아야 하는 것은 아니며, 법인의 재산가치 상승과 주식가치 상승 사이에 실질적 인과관계가 있으면 간접적 경제이익도 과세대상에 포함된다고 본다.',
                },
                {
                    id: 133,
                    subquestion_id: 13,
                    criterion_name: '사안의 포섭',
                    max_score: 3,
                    required: true,
                    display_order: 3,
                    description_display:
                        '사안에서 (주)A 소유 토지의 신도시 개발구역 지정 및 사업 시행으로 인하여 (주)A의 기업가치가 상승하였고, 그 결과 甲이 보유한 주식가치가 폭등하였으므로 두 사실 사이의 명확한 인과관계가 인정된다. 따라서 직접 대상 재산이 아니라는 형식적인 이유만으로 과세를 부정할 수 없다.',
                    description_compact: '신도시 개발로 법인 가치와 주식가치가 상승해 인과관계 인정',
                    keywords_json: kw(['신도시 개발', '기업가치 상승', '주식가치 폭등', '인과관계']),
                    example_answer_text:
                        '(주)A 소유 토지의 신도시 개발구역 지정 및 사업 시행으로 법인 가치가 상승하고 그 결과 甲의 주식가치가 폭등했으므로, 명확한 인과관계가 인정되어 과세할 수 있다.',
                },
            ],
        },
    ],
}

// ── 충실한 답안: 각 물음의 루브릭 요소를 실제로 담고 있음 (허위 누락 지적이 없어야 함) ──
const STRONG_ANSWERS: Record<number, string> = {
    1:
        '재산 취득 후 재산가치 증가에 따른 이익의 증여로 과세되려면 다음 세 요건을 모두 갖추어야 한다. ' +
        '첫째, 수증자 및 취득사유 요건으로서 직업·연령·소득 및 재산상태로 보아 자신의 계산과 자력으로 해당 행위를 할 수 없다고 인정되는 자(미성년자 등)가, 특수관계인으로부터 재산을 증여받거나, 특수관계인으로부터 공표되지 아니한 내부정보를 제공받아 관련 재산을 유상으로 취득하거나, 특수관계인으로부터 증여·차입한 자금으로 재산을 취득하여야 한다. ' +
        '둘째, 재산가치 증가사유 발생 요건으로서 그 재산을 취득한 날부터 5년 이내에 개발사업의 시행, 형질변경, 공유물 분할, 사업의 인가·허가, 비상장주식의 K-OTC 등록, 코넥스시장 상장 등 법정 재산가치 증가사유가 발생하여야 한다. ' +
        '셋째, 기준금액 이상의 이익 획득 요건으로서 그로 인해 얻은 재산가치상승금액이 3억 원 이상이거나, 취득가액과 통상적인 가치상승분 및 가치상승기여분 합계액의 30% 이상이어야 한다.',
    2:
        '석유화학공장 완공을 개발사업의 시행으로 본 과세관청의 처분은 위법하다. ' +
        '대법원은 재산가치증가사유인 개발사업의 시행을 적어도 개발구역의 지정·고시가 수반되어 토지를 개발하고 그 토지가치를 증가시키는 사업으로 엄격하게 해석한다. ' +
        '사안에서 (주)A가 토지개발과 무관하게 단순히 소유하던 일반 부지 위에 석유화학공장을 완공하고 제품 생산을 개시한 사정만으로는 법령이 예정한 개발사업의 시행에 해당한다고 볼 수 없으므로, 이를 개발사업의 시행으로 보아 과세한 처분은 위법하다.',
    3:
        '간접적 이익은 과세할 수 없다는 甲의 주장은 타당하지 않다. ' +
        '대법원은 조세회피 방지라는 입법취지를 고려할 때 재산가치증가사유의 직접적 대상인 재산(토지)과 수증자가 취득한 재산(주식)이 반드시 동일할 필요는 없다고 본다. 개발사업 등으로 법인의 재산가치가 상승하고 그에 따라 주주가 보유주식의 가치상승 이익을 얻었으며 두 사실 사이에 실질적 인과관계가 인정된다면 주주가 얻은 간접적 경제적 이익도 과세대상에 포함된다. ' +
        '사안에서 (주)A 소유 토지가 신도시 개발구역으로 지정되어 개발사업이 시행됨으로써 (주)A의 기업가치가 상승하였고 그 결과 甲의 주식가치가 폭등하였으므로 명확한 인과관계가 인정된다. 따라서 재산이 동일하지 않다는 형식적 이유만으로 과세를 부정할 수 없어 甲의 주장은 타당하지 않다.',
}

// ── 불완전 답안: 핵심 요건·법리가 빠져 관대화 방지 확인용 ──
const INCOMPLETE_ANSWERS: Record<number, string> = {
    1: '재산가치가 증가하면 증여세가 과세될 수 있다. 재산을 취득한 사람이 이익을 얻으면 과세 대상이 된다고 생각한다.',
    2: '공장을 완공한 것도 넓게 보면 개발의 일종이므로 과세관청의 처분은 적법한 것으로 보인다.',
    3: '토지와 주식은 별개의 재산이므로 甲의 주장처럼 간접적 이익에는 과세할 수 없다고 본다.',
}

// ── 절반 답안: 물음마다 일부 루브릭만 충족하는 내용을 쓰고 나머지는 완전히 생략
//    (루브릭 유형을 요건나열형/결론형/법리형으로 다양화해 편향 없이 검증)
const HALF_ANSWERS: Record<number, string> = {
    // 물음 1(9점): "수증자 요건"+"재산가치 증가사유 요건"만 서술, "기준금액 이상 이익 요건"(3억원/30%)은 미언급
    1:
        '재산 취득 후 재산가치 증가에 따른 이익의 증여로 과세되려면 다음 요건을 갖추어야 한다. ' +
        '첫째, 수증자 및 취득사유 요건으로서 직업·연령·소득 및 재산상태로 보아 자신의 계산과 자력으로 해당 행위를 할 수 없다고 인정되는 자(미성년자 등)가, 특수관계인으로부터 재산을 증여받거나, 특수관계인으로부터 공표되지 아니한 내부정보를 제공받아 관련 재산을 유상으로 취득하거나, 특수관계인으로부터 증여·차입한 자금으로 재산을 취득하여야 한다. ' +
        '둘째, 재산가치 증가사유 발생 요건으로서 그 재산을 취득한 날부터 5년 이내에 개발사업의 시행, 형질변경, 공유물 분할, 사업의 인가·허가, 비상장주식의 K-OTC 등록, 코넥스시장 상장 등 법정 재산가치 증가사유가 발생하여야 한다.',
    // 물음 2(7점): "결론"만 단언, 판례 법리·사안 포섭 근거는 전혀 제시하지 않음
    2: '석유화학공장 완공을 개발사업의 시행으로 본 과세관청의 처분은 위법하다.',
    // 물음 3(9점): "판례 법리"(추상적 법리)만 서술, 결론과 사실관계 포섭은 전혀 제시하지 않음
    3:
        '대법원은 조세회피 방지라는 입법취지를 고려할 때 재산가치증가사유의 직접적 대상인 재산과 수증자가 취득한 재산이 반드시 동일할 필요는 없다고 본다. ' +
        '개발사업 등으로 법인의 재산가치가 상승하고 그에 따라 주주가 보유주식의 가치상승 이익을 얻었으며 두 사실 사이에 실질적 인과관계가 인정된다면 주주가 얻은 간접적 경제적 이익도 과세대상에 포함된다.',
}

// 절반 답안에서 물음별로 "채운" 루브릭과 "비운" 루브릭 (기준명은 DB criterion_name과 일치)
const HALF_COVERAGE: Record<number, { covered: string[]; omitted: string[] }> = {
    1: {
        covered: ['수증자 및 재산 취득사유 요건', '재산가치 증가사유 발생 요건'],
        omitted: ['기준금액 이상의 이익 획득 요건'],
    },
    2: {
        covered: ['결론'],
        omitted: ['판례 법리', '사안의 포섭'],
    },
    3: {
        covered: ['판례 법리'],
        omitted: ['결론', '사안의 포섭'],
    },
}
// 절반 답안 기대 총점: 6(=3+3) + 2 + 4 = 12 / 25 (48%)

// ── 문제 51 데이터: cta_uploader/add_problem_51.py의 실제 업로드 값과 동일 ──
const problem51: ProblemWithDetails = {
    id: 51,
    subject_id: 1,
    title: '세무조사권 남용과 한계',
    total_score: 23,
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
    cta_subquestion: [
        {
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
                    example_answer_text:
                        '성실성 추정 배제 사유로는 납세협력의무 이행 누락, 무자료·위장·가공거래, 구체적인 탈세제보, 신고내용에 대한 명백한 탈루 자료 등이 있다.',
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
                    example_answer_text:
                        '구체적이고 객관적인 탈루 혐의 자료 없이 단순 의심만으로 수시 세무조사를 개시한 것은 조사권 남용으로 위법하다.',
                },
            ],
        },
        {
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
                    example_answer_text:
                        '명백한 자료란 조세탈루 개연성이 객관성과 합리성이 있는 자료로 상당히 인정되고, 종전 조사자료와 중복되지 않는 신규 자료여야 한다.',
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
                    example_answer_text:
                        '검찰 압수수색으로 확보된 차명계좌 엑셀 파일은 신규성 있는 구체적 자료이므로, 재조사를 허용하는 명백한 자료에 해당한다.',
                },
            ],
        },
        {
            id: 513,
            problem_id: 51,
            number: 3,
            score: 8,
            display_order: 3,
            prompt_text_full:
                "거래상대방인 乙에 대한 강도 높은 질문조사가 「국세기본법」에 따른 별도의 '세무조사'에 해당하는지에 대한 대법원 판례의 판단 기준을 설명하고, 세무조사 사전통지 및 과세예고통지 등 절차를 생략한 채 乙에게 종합소득세를 부과한 처분이 적법한지 논리적 근거를 들어 서술하시오.",
            prompt_text_compact: '거래상대방 질문조사가 별도 세무조사인지와 절차 생략 처분의 적법성을 서술하시오.',
            cta_subquestion_rubric: [
                {
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
                    example_answer_text:
                        '거래상대방에게 과세요건 사실에 대한 진술을 강요해 영업의 자유나 사생활의 자유가 침해될 염려가 있으면 별도의 세무조사에 해당한다.',
                },
                {
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
                    example_answer_text:
                        '乙에 대한 조사는 실질적인 세무조사에 해당하는데도 사전통지와 과세예고통지를 생략했으므로 과세처분은 위법하다.',
                },
            ],
        },
    ],
}

const STRONG_ANSWERS_51: Record<number, string> = {
    1:
        '성실성 추정 배제 사유로는 납세협력의무 이행 누락, 무자료·위장·가공거래 혐의, 구체적인 탈세제보, 신고내용에 탈루나 오류를 인정할 만한 명백한 자료가 있는 경우 등이 있다. ' +
        '이 사건에서 신용카드 지출액 과다라는 단순 의심만으로는 위 법정 사유 중 어느 것에도 해당하지 않으므로, 구체적 자료 없이 착수한 수시 세무조사는 조사권 남용으로서 위법하다.',
    2:
        '명백한 자료란 조세탈루 사실에 대한 개연성이 객관성과 합리성 있는 자료에 의해 상당한 정도로 인정되고, 종전 세무조사에서 이미 조사된 자료와 중복되지 않는 신규성을 갖춘 자료를 의미한다. ' +
        '이 사건 엑셀 파일은 검찰의 압수수색이라는 별도 절차를 통해 비로소 확보된 신규 자료이고 구체적 자금흐름이 상세히 기록되어 객관성과 합리성을 갖추었으므로 명백한 자료에 해당한다. 따라서 甲의 주장은 타당하지 않고 재조사는 적법하다.',
    // 버그 리포트의 수험생 답안 원문 그대로 ("과세예고통지"가 명시적으로 포함됨)
    3:
        '거래상대방에 대한 질문조사가 과세요건 사실에 관한 진술을 강요하여 거래상대방의 영업의 자유나 사생활의 자유를 침해할 염려가 있는 경우에는 단순한 참고인 조사를 넘어 거래상대방에 대한 별도의 세무조사에 해당한다. ' +
        '이 사건에서 乙에 대한 조사는 실질적으로 별도 세무조사인데도 사전통지와 과세예고통지 절차를 생략했으므로, 乙에 대한 종합소득세 경정·고지처분은 위법하다.',
}

const INCOMPLETE_ANSWERS_51: Record<number, string> = {
    1: '신용카드 지출이 많으면 세무조사를 할 수 있다고 생각한다.',
    2: '엑셀 파일은 증거로 사용할 수 있으므로 재조사는 문제없다고 본다.',
    3: '乙은 참고인 자격으로 조사를 받은 것이므로 별도의 세무조사라고 보기 어렵다. 다만 과세관청이 사전통지를 하지 않은 점은 다소 아쉬운 부분이다.',
}

interface ProblemFixture {
    problem: ProblemWithDetails
    label: string
    strongAnswers: Record<number, string>
    incompleteAnswers: Record<number, string>
    halfAnswers?: Record<number, string>
    halfCoverage?: Record<number, { covered: string[]; omitted: string[] }>
}

const PROBLEM1_FIXTURE: ProblemFixture = {
    problem: problem1,
    label: '문제 1(재산가치 증가이익의 증여)',
    strongAnswers: STRONG_ANSWERS,
    incompleteAnswers: INCOMPLETE_ANSWERS,
    halfAnswers: HALF_ANSWERS,
    halfCoverage: HALF_COVERAGE,
}

const PROBLEM51_FIXTURE: ProblemFixture = {
    problem: problem51,
    label: '문제 51(세무조사권 남용)',
    strongAnswers: STRONG_ANSWERS_51,
    incompleteAnswers: INCOMPLETE_ANSWERS_51,
}

type Mode = 'strong' | 'incomplete' | 'half'

function buildAnswers(fixture: ProblemFixture, mode: Mode): SubquestionAnswer[] {
    const src =
        mode === 'incomplete'
            ? fixture.incompleteAnswers
            : mode === 'half'
            ? fixture.halfAnswers
            : fixture.strongAnswers
    if (!src) {
        throw new Error(`${fixture.label}은(는) --${mode} 모드를 지원하지 않습니다.`)
    }
    return fixture.problem.cta_subquestion.map((sq) => ({ subquestionNumber: sq.number, answerText: src[sq.number] }))
}

// 정규화: 공백·주요 문장부호 제거 (존재 확인 전용)
function normalize(text: string): string {
    return text.normalize('NFC').replace(/[\s·.,'"“”‘’()[\]「」『』〈〉《》:;!?~\-]/g, '')
}

// 피드백에서 "'X' 누락 / X 언급이 없 / X이 없" 류 주장을 추출해, 해당 답안에 X가 실제로 존재하면 허위 누락으로 판정
function findFalseOmissions(feedback: string, answerText: string): string[] {
    const normAnswer = normalize(answerText)
    const found: string[] = []
    // 따옴표로 감싼 구절 뒤에 누락/언급없음 류 표현이 오는 패턴
    const re =
        /['‘"“「]([^'’"”」]{2,30})['’"”」]\s*(?:[이가은는을를에의]{0,2}\s*(?:대한|관한)?\s*)?(?:누락|언급이 없|언급되지 않|빠져|미기재|기재되지 않|서술이 없|없어|없음|부족)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(feedback)) !== null) {
        const phrase = m[1]
        if (phrase && normAnswer.includes(normalize(phrase))) {
            found.push(phrase)
        }
    }
    return found
}

async function main() {
    const fixture = process.argv.includes('--problem51') ? PROBLEM51_FIXTURE : PROBLEM1_FIXTURE
    const mode: Mode = process.argv.includes('--half')
        ? 'half'
        : process.argv.includes('--incomplete')
        ? 'incomplete'
        : 'strong'
    const modeLabel =
        mode === 'half' ? '절반 답안(비례성 확인)' : mode === 'incomplete' ? '관대화 방지(불완전 답안)' : '재현(충실한 답안)'
    console.log(`\n=== ${fixture.label} 채점 검증: ${modeLabel} 모드 ===\n`)

    const answers = buildAnswers(fixture, mode)
    const result = await gradeProblem(fixture.problem, answers)

    console.log(`총점: ${result.totalScore} / ${result.maxScore}`)
    console.log(`총평: ${result.overallComment}`)
    if (result._diagnostics) {
        console.log(`진단(유령 근거 보정): retried=${result._diagnostics.retried}`)
        for (const c of result._diagnostics.contradictions) console.log(`  - ${c}`)
    }
    console.log('')

    const answerByNum = new Map(answers.map((a) => [a.subquestionNumber, a.answerText]))
    const falseOmissionsAll: { sq: number; phrases: string[] }[] = []

    for (const sq of result.subquestions) {
        console.log(`물음 ${sq.number}: ${sq.awardedScore} / ${sq.maxScore}점`)
        for (const rr of sq.rubricResults) {
            const status = (rr as unknown as { status?: string }).status ?? '(status 없음)'
            const quote = (rr as unknown as { evidenceQuote?: string }).evidenceQuote
            console.log(
                `  - ${rr.criterionName}: ${rr.awardedScore}/${rr.maxScore} [${status}]${
                    quote ? ` 근거: "${quote}"` : ''
                }`
            )
        }
        console.log(`  피드백: ${sq.feedback}`)
        const fo = findFalseOmissions(sq.feedback, answerByNum.get(sq.number) || '')
        if (fo.length) falseOmissionsAll.push({ sq: sq.number, phrases: fo })
        console.log('')
    }

    // ── 판정 ──
    const checks: { name: string; pass: boolean }[] = []

    // 부분 점수가 소수(예: 0.4)로 나올 수 있어 JS 덧셈 자체가 미세한 부동소수점 오차를
    // 낳는다(0.4+0.8=1.2000000000000002 등) — 이는 채점 로직의 버그가 아니라 IEEE754의
    // 근본적 한계이므로, 산술 일관성 검사는 엄격한 ===이 아니라 허용오차 비교로 판정한다.
    const approxEqual = (a: number, b: number) => Math.abs(a - b) < 1e-6

    // [공통, 모든 모드] 버그 2: 응답 내부 산술 일관성
    for (const sq of result.subquestions) {
        const rubricSum = sq.rubricResults.reduce((s, r) => s + r.awardedScore, 0)
        checks.push({
            name: `물음 ${sq.number} 루브릭 합산(${rubricSum}) === 물음 점수(${sq.awardedScore})`,
            pass: approxEqual(rubricSum, sq.awardedScore),
        })
    }
    const sqSum = result.subquestions.reduce((s, sq) => s + sq.awardedScore, 0)
    checks.push({
        name: `물음 점수 합산(${sqSum}) === 총점(${result.totalScore})`,
        pass: approxEqual(sqSum, result.totalScore),
    })

    // [공통, 모든 모드] 버그 1: 유령 근거(무근거 만점) — gradeProblem.ts 내부 함수를 가져다 쓰지 않고 독립 재구현
    for (const sq of result.subquestions) {
        const normAns = normalize(answerByNum.get(sq.number) || '')
        for (const rr of sq.rubricResults) {
            const status = (rr as unknown as { status?: string }).status
            const credited = status !== 'unmet' && rr.awardedScore > 0
            if (!credited) continue
            const quote = normalize(((rr as unknown as { evidenceQuote?: string }).evidenceQuote || '').trim())
            checks.push({
                name: `물음 ${sq.number} "${rr.criterionName}" 근거 인용이 답안에 실존함`,
                pass: quote.length > 0 && normAns.includes(quote),
            })
        }
    }

    if (mode === 'incomplete') {
        checks.push({
            name: `불완전 답안 총점이 만점의 60% 미만 (${result.totalScore}/${result.maxScore})`,
            pass: result.totalScore < result.maxScore * 0.6,
        })
    } else if (mode === 'half') {
        // 채운 루브릭은 고득점(≥70%), 비운 루브릭은 저득점(≤30%)이어야 하며
        // 총점은 대략 절반대(만점의 30~65%)에 들어와야 함
        for (const sq of result.subquestions) {
            const coverage = fixture.halfCoverage?.[sq.number]
            if (!coverage) continue
            for (const rr of sq.rubricResults) {
                const ratio = rr.maxScore > 0 ? rr.awardedScore / rr.maxScore : 0
                if (coverage.covered.includes(rr.criterionName)) {
                    checks.push({
                        name: `물음 ${sq.number} "${rr.criterionName}"(채움) 70% 이상 획득 (${rr.awardedScore}/${rr.maxScore})`,
                        pass: ratio >= 0.7,
                    })
                } else if (coverage.omitted.includes(rr.criterionName)) {
                    checks.push({
                        name: `물음 ${sq.number} "${rr.criterionName}"(비움) 30% 이하로 감점 (${rr.awardedScore}/${rr.maxScore})`,
                        pass: ratio <= 0.3,
                    })
                }
            }
        }
        checks.push({
            name: `총점이 만점의 30~65% 범위 (절반 정도) (${result.totalScore}/${result.maxScore})`,
            pass: result.totalScore >= result.maxScore * 0.3 && result.totalScore <= result.maxScore * 0.65,
        })
    } else {
        checks.push({
            name: `충실한 답안 총점이 만점의 84% 이상 (${result.totalScore}/${result.maxScore})`,
            pass: result.totalScore >= result.maxScore * 0.84,
        })
        checks.push({
            name: '답안에 실존하는 표현을 누락으로 지적한 허위 감점 없음',
            pass: falseOmissionsAll.length === 0,
        })
    }

    console.log('─'.repeat(50))
    let allPass = true
    for (const c of checks) {
        console.log(`${c.pass ? 'PASS' : 'FAIL'}: ${c.name}`)
        if (!c.pass) allPass = false
    }
    if (falseOmissionsAll.length) {
        console.log('\n⚠ 허위 누락 지적 감지:')
        for (const f of falseOmissionsAll) {
            console.log(`  물음 ${f.sq}: "${f.phrases.join('", "')}" — 답안에 실제로 존재함`)
        }
    }
    process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
    console.error('스크립트 실행 오류:', err)
    process.exit(1)
})
