import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve(__dirname, '../../cta_uploader/data')
const OUT_PATH = path.resolve(__dirname, 'verify-extra.ts')
const TARGET_IDS = [2, 12, 22, 32, 42, 52]

function processProblems() {
    const targetProblems: any[] = []

    for (const id of TARGET_IDS) {
        const filePath = path.join(DATA_DIR, `problem_${id}.json`)
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf8')
            const rawArr = JSON.parse(rawData)
            const p = Array.isArray(rawArr) ? rawArr[0] : rawArr

            // Map to ProblemWithDetails
            const mapped = {
                ...p,
                id: p.problem_id || id,
                cta_subquestion: (p.subquestions || []).map((sq: any) => ({
                    ...sq,
                    problem_id: p.problem_id || id,
                    cta_subquestion_rubric: (sq.rubrics || []).map((r: any) => ({
                        ...r,
                        subquestion_id: sq.id || sq.number,
                        keywords_json: r.keywords || []
                    }))
                }))
            }
            targetProblems.push(mapped)
        } else {
            console.log(`Warning: ${filePath} not found`)
        }
    }

    console.log(`Found problems: ${targetProblems.map((p: any) => p.id).join(', ')}`)

    let tsCode = `
import { gradeProblem } from '../src/lib/gemini/gradeProblem'
import type { ProblemWithDetails } from '../src/types/db'
import type { SubquestionAnswer } from '../src/types/grading'

const kw = (words: string[]) => words as unknown as Record<string, unknown>

// -- Extracted Problems --
`

    const fixtureList: string[] = []

    for (const p of targetProblems) {
        tsCode += `const problem${p.id}: ProblemWithDetails = `

        let pString = JSON.stringify(p, null, 4)
        pString = pString.replace(/"keywords_json": (\[.*?\])/gs, '"keywords_json": kw($1)')

        tsCode += pString + ';\n\n'

        tsCode += `const STRONG_ANSWERS_${p.id}: Record<number, string> = {\n`
        for (const sq of p.cta_subquestion) {
            const joinedText = sq.cta_subquestion_rubric.map((r: any) => r.example_answer_text || r.description_compact).join(' ')
            tsCode += `    ${sq.number}: ${JSON.stringify(joinedText)},\n`
        }
        tsCode += `};\n\n`

        tsCode += `const FIXTURE_${p.id} = {
    problem: problem${p.id},
    label: "문제 ${p.id}(${p.title})",
    strongAnswers: STRONG_ANSWERS_${p.id}
};\n\n`

        fixtureList.push(`FIXTURE_${p.id}`)
    }

    tsCode += `
async function main() {
    console.log("=== 테스트 미시행 기출문제 테스트 추가 수행 시작 ===\\n");
    const fixtures = [${fixtureList.join(', ')}];
    for (const fixture of fixtures) {
        console.log(\`[ \${fixture.label} 채점 검증: 충실한 답안(strong) 모드 ]\`);
        const answers = fixture.problem.cta_subquestion.map((sq: any) => ({
            subquestionNumber: sq.number,
            answerText: fixture.strongAnswers[sq.number]
        }));
        
        const result = await gradeProblem(fixture.problem, answers);
        console.log(\`총점: \${result.totalScore} / \${result.maxScore}\`);
        console.log(\`총평: \${result.overallComment}\\n\`);
        
        for (const sq of result.subquestions) {
            console.log(\`물음 \${sq.number}: \${sq.awardedScore} / \${sq.maxScore}점\`);
            for (const rr of sq.rubricResults) {
                const status = (rr as any).status ?? '(status 없음)';
                console.log(\`  - \${rr.criterionName}: \${rr.awardedScore}/\${rr.maxScore} [\${status}]\`);
            }
            console.log(\`  피드백: \${sq.feedback}\\n\`);
        }
        
        console.log('─'.repeat(50));
    }
}

main().catch(console.error);
`

    fs.writeFileSync(OUT_PATH, tsCode)
    console.log('Successfully generated ' + OUT_PATH)
}

processProblems()
