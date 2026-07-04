const { GoogleGenAI, Type } = require('@google/genai');
// dotenv를 사용하지 않고 node --env-file 옵션으로 환경변수를 주입받음

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('오류: .env.local 파일에 GEMINI_API_KEY가 없습니다.');
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function run() {
    console.log('Gemini 2.5 Flash-Lite 채점 및 구조화 출력 성능 테스트 시작...');

    const mockProblem = {
        title: '테스트용 소득세법 문제',
        total_score: 20,
        case_text_full: '거주자 甲은 2026년 중 부동산임대업을 영위하여 총 수입금액 50,000,000원이 발생하였다. 이에 필요한 경비는 총 30,000,000원으로 계상되었으나, 초과인출금에 대한 지급이자 5,000,000원이 포함되어 있다.',
        issue_text_full: '초과인출금에 대한 지급이자의 필요경비 불산입 여부 및 실제 종합소득금액 계산',
        subquestions: [
            {
                number: 1,
                score: 10,
                prompt_text_full: '부동산임대업 필요경비 불산입 대상인 초과인출금 지급이자의 규정과 그 취지에 대하여 설명하시오.',
                subquestion_rubrics: [
                    { criterion_name: '규정 부합성', max_score: 5 },
                    { criterion_name: '취지 설명', max_score: 5 }
                ]
            },
            {
                number: 2,
                score: 10,
                prompt_text_full: '필요경비 불산입 금액을 제외한 甲의 부동산임대업 소득금액을 계산하시오.',
                subquestion_rubrics: [
                    { criterion_name: '계산 과정의 정확성', max_score: 5 },
                    { criterion_name: '최종 산출금액', max_score: 5 }
                ]
            }
        ]
    };

    const mockAnswers = [
        {
            subquestionNumber: 1,
            answerText: '초과인출금 지급이자는 가사 관련 비용에 준하여 소득세법에 따라 부동산임대업의 필요경비에 산입하지 않습니다. 이는 사업용 자산을 초과하여 부채를 유입시킨 경우 지급이자의 비용 인정을 규제하기 위함입니다.'
        },
        {
            subquestionNumber: 2,
            answerText: '총 수입금액은 50,000,000원입니다. 필요경비 중 초과인출금 지급이자 5,000,000원은 필요경비 불산입되므로, 인정되는 실제 필요경비는 30,000,000 - 5,000,000 = 25,000,000원입니다. 따라서 최종 소득금액은 50,000,000 - 25,000,000 = 25,000,000원입니다.'
        }
    ];

    // 프롬프트 작성
    const subquestionPrompts = mockProblem.subquestions.map((sq) => {
        const answer = mockAnswers.find((a) => a.subquestionNumber === sq.number);
        const rubrics = sq.subquestion_rubrics
            .map((r) => `  - 기준명: "${r.criterion_name}" (배점: ${r.max_score}점)`)
            .join('\n');

        return `
### 소문항 ${sq.number} (배점: ${sq.score}점)
문제: ${sq.prompt_text_full}

채점 루브릭:
${rubrics}

수험생 답안:
${answer ? answer.answerText : ''}
`;
    });

    const systemPrompt = `당신은 세무사 시험 채점 전문가입니다.
아래의 세법 문제에 대한 수험생 답안을 채점해 주세요.

채점 원칙:
1. 각 소문항의 배점을 절대 초과하지 마세요.
2. 각 루브릭 기준별로 배점 내에서 점수를 부여하세요.
3. 루브릭의 max_score를 초과하지 마세요.
4. 핵심 키워드와 논리 구조를 중심으로 평가하세요.
5. 피드백은 구체적으로, 어떤 부분이 좋았고 무엇이 부족한지 명시하세요.
6. 모든 응답은 한국어로 작성하세요.`;

    const userPrompt = `
## 문제 정보
제목: ${mockProblem.title}
총 배점: ${mockProblem.total_score}점

### 사례문
${mockProblem.case_text_full}

### 쟁점
${mockProblem.issue_text_full}

${subquestionPrompts.join('\n---\n')}
`;

    try {
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
                                    number: { type: Type.NUMBER, description: '소문항 번호' },
                                    awardedScore: { type: Type.NUMBER, description: '획득 점수' },
                                    maxScore: { type: Type.NUMBER, description: '배점' },
                                    feedback: { type: Type.STRING, description: '소문항별 피드백' },
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
                        overallComment: { type: Type.STRING, description: '전체 총평' },
                    },
                    required: ['totalScore', 'subquestions', 'overallComment'],
                },
            },
        });

        console.log('Gemini API 호출 성공!');
        console.log('응답 텍스트:');
        console.log(JSON.stringify(JSON.parse(response.text), null, 2));
    } catch (err) {
        console.error('테스트 실패:', err);
    }
}

run();
