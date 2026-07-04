import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { ProblemWithDetails } from '@/types/db'
import AnswerForm from '@/components/AnswerForm'

export default async function ProblemPage({
    params,
}: {
    params: Promise<{ problemId: string }>
}) {
    const { problemId } = await params
    const supabase = await createClient()

    // 문제 + 소문항 + 루브릭 전체 조회
    const { data: problem } = await supabase
        .from('problems')
        .select(`
      *,
      subquestions (
        *,
        subquestion_rubrics (*)
      )
    `)
        .eq('id', Number(problemId))
        .single()

    if (!problem) {
        notFound()
    }

    const typedProblem = problem as ProblemWithDetails

    // 소문항을 display_order 순으로 정렬
    typedProblem.subquestions.sort((a, b) => a.display_order - b.display_order)
    typedProblem.subquestions.forEach((sq) => {
        sq.subquestion_rubrics.sort((a, b) => a.display_order - b.display_order)
    })

    // 과목명 조회
    const { data: subject } = await supabase
        .from('subjects')
        .select('name')
        .eq('id', typedProblem.subject_id)
        .single()

    return (
        <div className="container">
            <Link href={`/subjects/${typedProblem.subject_id}`} className="back-link">
                ← {subject?.name || '문제 목록'}으로
            </Link>

            <div className="problem-header">
                <h1>{typedProblem.title}</h1>
                <div className="meta">
                    총 배점: {typedProblem.total_score}점 · 소문항 {typedProblem.subquestions.length}개
                </div>
            </div>

            {/* 사례문 */}
            {(typedProblem.case_text_full || typedProblem.case_text_compact) && (
                <div>
                    <div className="case-text-label">📄 사례문</div>
                    <div className="case-text">
                        {typedProblem.case_text_full || typedProblem.case_text_compact}
                    </div>
                </div>
            )}

            {/* 쟁점 */}
            {(typedProblem.issue_text_full || typedProblem.issue_text_compact) && (
                <div>
                    <div className="case-text-label">⚖️ 쟁점</div>
                    <div className="case-text">
                        {typedProblem.issue_text_full || typedProblem.issue_text_compact}
                    </div>
                </div>
            )}

            {/* 답안 입력 + 채점 결과 (Client Component) */}
            <AnswerForm problem={typedProblem} />
        </div>
    )
}
