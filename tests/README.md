# 채점 로직(gradeProblem.ts) 테스트 가이드

AI 채점(`src/lib/gemini/gradeProblem.ts`)은 자동 유닛테스트가 어렵다 — 결과가 실제 Gemini 호출에 달려있고, "정답"이 이산적인 pass/fail이 아니라 점수·근거의 타당성이라 어서션을 세심하게 설계해야 한다. 이 문서는 지금까지 이 파일들로 무엇을, 왜, 어떻게 검증했는지와 다음에 새 버그를 의심할 때 어떤 실험을 먼저 시도하면 되는지 정리한 것이다.

## 스크립트 두 개

### `verify-grading.ts` — 정식 회귀 검증 스위트

문제 1(재산가치 증가이익의 증여, 상속세및증여세법), 문제 51(세무조사권 남용, 국세기본법), 문제 9(면세전용과 공통매입세액 재계산, 부가가치세법) 세 개의 서로 다른 과목·구조 픽스처를 내장하고 있다. 문제를 하나만 쓰면 그 문제의 특정 문구에 과적합된 수정을 놓칠 수 있어서 처음부터 여러 개를 유지했다. 문제 9는 물음당 루브릭이 최대 6개(문제1·51은 2~3개)라 루브릭 개수가 많을 때도 산술·근거검증 로직이 깨지지 않는지 확인하는 용도를 겸한다.

```bash
cd CTA_tax_law
npx -y tsx --env-file=.env.local tests/verify-grading.ts                  # 문제1 충실한 답안 (기본)
npx -y tsx --env-file=.env.local tests/verify-grading.ts --incomplete      # 문제1 관대화 방지
npx -y tsx --env-file=.env.local tests/verify-grading.ts --half            # 문제1 절반 답안 비례성
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem51       # 문제51 강한 답안
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem51 --incomplete
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem51 --half # 문제51 절반 답안 비례성
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem9        # 문제9 강한 답안 (부가가치세법)
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem9 --incomplete
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem9 --half # 문제9 절반 답안 비례성
npx -y tsx --env-file=.env.local tests/verify-grading.ts --ambiguous            # 문제1 애매한 표현 답안
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem51 --ambiguous
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem9 --ambiguous
npx -y tsx --env-file=.env.local tests/verify-grading.ts --overgeneralized      # 문제1 일반화된 오답
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem51 --overgeneralized
npx -y tsx --env-file=.env.local tests/verify-grading.ts --problem9 --overgeneralized
```

모드별로 하는 일:

| 모드 | 답안 | 확인하는 것 |
|---|---|---|
| (기본) strong | 루브릭 내용을 실제로 담은 충실한 답안 | 총점이 만점 근처(≥84%)인지, 실존 표현을 허위로 "누락"이라 지적하지 않는지 |
| `--incomplete` | 핵심 요건이 빠진 부실한 답안 | 관대하게 채점되지 않는지(총점 <60%) — 엄격함을 잃지 않았는지 확인 |
| `--half` | 물음마다 루브릭 일부만 채우고 나머지는 완전히 비운 답안 | 채운 루브릭은 고득점(≥70%), 비운 루브릭은 저득점(≤30%)인지 — 점수가 실제 정답 비율에 비례하는지 |
| `--ambiguous` | STRONG과 논리·내용은 동일하지만 정확한 법률 용어 대신 구어체로 에둘러 쓰고 결론도 완곡하게 표현한 답안 | 정확한 키워드가 없다는 이유만으로 루브릭이 부당하게 0점(unmet) 처리되지 않는지, 총점이 만점의 60% 이상 유지되는지 |
| `--overgeneralized` | 막연하거나 자신 없는 게 아니라, 자신감 있는 어조로 그럴듯한 일반 원칙을 내세우되 이 사안의 구체적 요건·예외를 무시하거나 뒤집어서 결론 자체가 틀린 답안 | 권위 있어 보이는 말투·법률 용어에 속아 관대하게 채점되지 않는지 (총점 <40%, `--incomplete`의 60%보다 더 엄격한 기준) |

`--half`는 세 문제 모두에서 검증한다: 문제1(물음당 루브릭 2~3개 중 일부만 채움), 문제51(물음당 루브릭이 정확히 2개라 "법리/정의"·"결론/포섭" 중 하나씩 번갈아 채움), 문제9(물음1은 "취지" 2개만 채우고 "산정방법"은 비움, 물음2는 6개 중 앞 3개인 "요건"만 채우고 "시기"·"배제사유" 3개는 비움). 세 문제 모두 총점이 만점의 30~65%(대략 절반) 범위에 들어와야 통과 — 실제 실행 결과 문제1 12/25(48%), 문제51 12/23(52%), 문제9 10/20(50%)로 전부 통과했다.

`--ambiguous` 실행 결과: 세 문제 모두 통과한다(문제1 19/25=76%, 문제51 20/23=87%, 문제9 17/20=85%).

`--ambiguous` 답안을 작성할 때 주의할 점 하나: 수치로 정해진 요건("면세비율 차이 5% 이상")을 완곡하게 쓴다고 "다섯 퍼센트 **정도** 이상"처럼 "정도"를 붙이면 안 된다 — 이는 단순한 구어체 표현이 아니라 정확한 수치 요건에 불확실성을 더해 실제로 더 약한(틀린) 주장이 되기 때문이다. 실제로 문제9 물음2 "재계산 요건 3"에 "정도"를 넣었더니 0/2(unmet)로 처리됐고, "정도"를 빼자(그 외 문장 구조는 그대로 두고) 1/2(partially_met)로 나왔다 — 채점 로직의 버그가 아니라 테스트 답안 설계 실수였다. 수치 요건은 "정도·대략·쯤" 같은 헤지 없이 정확한 숫자를 그대로 쓰되, 그 앞뒤 문장만 구어체로 풀어써야 "논리는 맞지만 표현만 애매한" 경우를 제대로 검증한다.

`--overgeneralized`는 `--incomplete`와 다르다: incomplete는 막연하고 자신 없는 부실한 답안(예: "~인 것 같다")인 반면, overgeneralized는 그럴듯한 일반 원칙("이 제도의 취지는 ~이므로", "대법원도 ~폭넓게 인정해 왔다")을 자신 있게 내세우면서 정작 이 사안에 적용되는 구체적 요건·예외·수치 기준을 무시하거나 결론을 통째로 뒤집는 답안이다. 채점 모델이 권위 있어 보이는 어조나 법률 용어 사용 자체에 속아 관대하게 점수를 주는지를 별도로 검증하기 위해 incomplete보다 더 엄격한 기준(40% 미만)을 쓴다. 실행 결과 세 문제 모두 통과했다(문제1 3/25=12%, 문제51 0/23=0%, 문제9 0/20=0%) — 특히 문제51 물음2(재조사가 위법하다고 뒤집은 답안)와 문제9(제도 자체를 부정한 답안)는 완전히 0점 처리되어, 자신감 있는 어조에 흔들리지 않고 결론의 정오를 정확히 가려냈다.

**모든 모드에서 공통으로 도는 어서션** (문제·답안 내용과 무관하게 항상 참이어야 함):
- Σ루브릭 점수 === 물음 점수, Σ물음 점수 === 총점 (산술 일관성)
- `status !== 'unmet' && awardedScore > 0`인 모든 루브릭에서 `evidenceQuote`가 실제로 해당 물음 답안에 존재함 (근거 없이 점수 준 게 아닌지)

이 공통 어서션은 `gradeProblem.ts` 내부 함수(`findPhantomEvidence` 등)를 import해서 재사용하지 않고 스크립트 자체 로직으로 **독립 재구현**했다 — 수정 코드와 검증 코드가 같은 버그를 공유하면 그 버그를 영원히 못 잡기 때문.

### `investigate-q3-strictness.ts` — 일회성 원인 규명용 진단 스크립트

"채점이 이상하게 나온다"는 관찰만으로는 그게 (a) 모델의 정당한 엄격함인지 (b) 실제 버그인지 구분이 안 된다. 이 스크립트는 문제51 물음3 "처분의 적법성"이 정확한 답안인데도 0점 처리된 사례 하나를 놓고, 아래 "새 버그 의심될 때 실험 순서"의 4단계를 실제로 적용한 예시다. 구조를 그대로 복사해서 다른 사례에 재사용하면 된다. 정식 회귀 스위트가 아니라 진단이 끝나면 지워도 되는 일회성 스크립트 — 남겨둔 이유는 다음에 비슷한 조사를 할 때 템플릿으로 쓰기 위함.

## 새 버그(또는 "버그 같은데 확신이 안 서는 현상")를 의심할 때 실험 순서

이상 채점 사례를 하나 발견했을 때, 아래 순서로 실험하면 원인을 빠르게 좁힐 수 있다. 실제로 이 순서로 물음3 사례의 원인(다물음 동시채점 시 주의력 분산)을 확정했다.

1. **재현성 확인** — 같은 문제·답안으로 3회 반복 실행(temperature 0이라 거의 결정론적). 매번 같은 결과면 "우연한 흔들림"이 아니라 코드/프롬프트에 박힌 systematic 문제.

2. **모범답안 자체 테스트** — 루브릭의 `example_answer_text`를 그대로 제출해도 같은 문제가 재현되는가? 재현되면 **학생 답안 문제가 아니라 채점 기준·프롬프트 자체의 버그**. 재현 안 되면 학생 답안의 특정 표현 문제이거나 다음 단계(단독 채점)로.

3. **단독 채점 vs 묶음 채점 비교** — 문제가 있던 그 물음만 떼어내(다른 물음 없이) 같은 답안으로 채점했을 때도 재현되는가? 여기서 결과가 달라지면(묶으면 실패, 단독이면 성공 등) **다물음 동시 채점 특유의 교차 오염** — 이번 세션에서 실제로 발견된 패턴. `gradeProblem()`은 `ProblemWithDetails.cta_subquestion` 배열 길이에 무관하게 동작하므로, 물음 1개짜리 미니 `problem` 객체를 즉석에서 만들어 비교하면 된다 (`investigate-q3-strictness.ts`의 `makeProblem51([SUBQUESTION_3])` 패턴 참고).

4. **답안 강화/변형 테스트** — 의심되는 문구를 명시적으로 추가하거나 표현을 바꿨을 때 점수가 반응하는가? 반응하면(강화하니 점수가 오름) 어느 정도는 정당한 엄격함일 수 있음. 원본과 강화판이 "단독으로는 둘 다 만점, 묶으면 둘 다 0점" 식으로 답안 내용과 무관하게 같이 움직이면 답안 문제가 아니라 구조적 문제라는 뜻.

이 4가지를 다 실행해도 애매하면, `_diagnostics` 필드(교정 재시도가 실제로 발동했는지·어떤 모순이었는지)와 `console.warn` 로그(`[grading] ...`)를 같이 확인한다 — `gradeProblem.ts`는 재시도/강제 0점 처리마다 로그를 남긴다.

## 다른 문제로 픽스처 추가하는 법

`verify-grading.ts`의 `ProblemFixture` 인터페이스를 따른다:
```ts
interface ProblemFixture {
    problem: ProblemWithDetails       // cta_uploader/data/problem_N.json 또는 add_problem_N.py에서 그대로 복사
    label: string
    strongAnswers: Record<number, string>   // 물음 번호 → 충실한 답안
    incompleteAnswers: Record<number, string>
    halfAnswers?: Record<number, string>            // 선택
    halfCoverage?: Record<number, { covered: string[]; omitted: string[] }>  // half 답안 작성 시 함께 정의
}
```
문제 데이터는 실제 DB에 올라간 값과 반드시 일치시킨다(`cta_uploader/data/problem_N.json`이 원본). `keywords_json`은 실제로는 문자열 배열이지만 타입 정의가 `Record<string, unknown>`이라 스크립트 상단의 `kw()` 헬퍼로 캐스팅해서 넣는다.

## 이번 세션에 발견·수정된 버그 (참고용 이력)

| # | 증상 | 원인 | 수정 |
|---|---|---|---|
| 1 | 답안에 실존하는 표현("과세예고통지")을 "누락됨"이라 허위로 지적, 감점 | 루브릭 설명이 compact(압축)로 전달돼 대조 문맥 부족 + flash-lite thinking 기본 비활성 | 루브릭 설명 full 우선 + `thinkingConfig` 활성화 + temperature 0 |
| 2 | Gemini API 일시 과부하(503)로 채점 요청 전체 실패 | 재시도 로직 없음 | `generateContentWithRetry` — 429/500/502/503/504에 지수 백오프 4회 |
| 3 | 응답 내부에서 Σ루브릭점수 ≠ 물음점수 ≠ 총점 | 모델이 스스로 집계한 숫자를 그대로 신뢰 | `normalizeScoresAgainstRubrics` — DB 배점을 신뢰 기준으로 코드에서 항상 재계산 |
| 4 | 답안에 없는 내용(판례 법리)에 만점 부여 | 근거 검증 없이 점수만 산출 | `evidenceQuote` 스키마 필드 강제 + `findPhantomEvidence` 탐지 + 스코프 축소형 보정 재시도 |
| 5 | (4 수정 중 발견) 보정 재시도가 전체 JSON 재생성 → 무관한 물음까지 0점으로 붕괴 | "다른 건 그대로 두라"는 프롬프트 지시를 모델이 안정적으로 안 지킴 | 재시도를 "모순 항목만 재판정 → corrections 배열 → 코드에서 병합"으로 재설계, 원래 모순 목록에 없는 키는 코드가 물리적으로 못 건드리게 함 |
| 6 | (5 수정 중 발견) 한 물음 안에 루브릭 일부만 채워진 "혼재" 케이스에서 채워진 루브릭까지 통째로 0점 | "근거 없이 점수 주지 마라"는 신규 규칙의 강한 어조가 물음 전체를 뭉뚱그려 판단하게 유도 | 시스템 프롬프트 규칙 12(기준별 독립 판단) 추가 |
| 7 | (6 수정 중 발견) 자체 방어 로직(`evidence_too_trivial`)이 "답안 전체를 그대로 인용"을 복붙으로 오판 | 답안이 짧고 한 루브릭만 다루는 경우 전체 인용이 정확한 근거일 수 있음을 간과 | 해당 휴리스틱(`wholeAnswerCopy`) 제거, 최소 길이 체크만 유지 |
| 8 | `status: 'partially_met'`인데 `awardedScore: 0`인 라벨 불일치 | 모델 출력의 라벨·점수가 자체 정의(규칙 6)와 안 맞음 | `normalizeScoresAgainstRubrics`에서 0점이면 라벨을 `unmet`으로 통일 |
| 9 | 정확한 근거를 인용하고도 unmet+0점 (다른 물음과 묶어 채점할 때만 재현, 단독 채점 시 4/4) | 다물음 동시 채점 시 주의력 분산/오염 — `findPhantomEvidence`는 "점수 줬는데 근거 없음"만 잡고 "근거 있는데 점수 안 줌"은 놓침 | `findSuppressedEvidence` 추가(대칭 케이스 탐지), 동일 보정 재시도 파이프라인 재사용 + "다른 기준 판정에 얽매이지 말고 독립적으로 재검토하라" 지시 추가 |

## 알려진 한계 (버그 아님, 의도적으로 손대지 않음)

- **근거 인용의 관련성은 검증하지 않음**: `evidenceQuote`가 답안에 실제로 존재하는지(substring)만 확인하고, 그 인용문이 해당 루브릭과 진짜 관련 있는지는 확인하지 않는다. 모델이 무관한 문장을 그럴듯하게 골라 인용하면 통과할 수 있음 — 결정론적 계층으로 완전히 막을 수 있는 종류가 아니라 수용한 잔여 리스크.
- **문제1 물음1 "재산가치 증가사유 발생 요건"이 내용을 다 담았는데도 partially_met(2/3)로 나온 사례**: 압축된 한 문장에 모든 요소를 나열한 것을 "간략하다"고 강도 있게 판단한 경우로, 명백히 틀렸다고 보기 애매한 강도 판단이라 별도로 조정하지 않음.
