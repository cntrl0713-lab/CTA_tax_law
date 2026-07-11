import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
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
    const supabase = createAdminClient()

    // 문제 + 소문항 + 루브릭 전체 조회
    const { data: problem } = await supabase
        .from('cta_problem')
        .select(`
      *,
      cta_subquestion (
        *,
        cta_subquestion_rubric (*)
      )
    `)
        .eq('id', Number(problemId))
        .single()

    if (!problem) {
        notFound()
    }

    const typedProblem = problem as ProblemWithDetails

    // 소문항을 display_order 순으로 정렬
    typedProblem.cta_subquestion.sort((a, b) => a.display_order - b.display_order)
    typedProblem.cta_subquestion.forEach((sq) => {
        sq.cta_subquestion_rubric.sort((a, b) => a.display_order - b.display_order)
    })

    // 과목명 조회
    const { data: subject } = await supabase
        .from('cta_subject')
        .select('name')
        .eq('id', typedProblem.subject_id)
        .single()

    // 로그인 유저 tier 조회 (힌트/정답보기 버튼 표시용)
    const authClient = await createClient()
    const { data: { user: authUser } } = await authClient.auth.getUser()
    let userTier: 'guest' | 'member' | 'pro' | 'admin' = 'guest'
    if (authUser && !authUser.is_anonymous) {
        const { data: ctaUser } = await supabase
            .from('cta_user')
            .select('tier')
            .eq('id', authUser.id)
            .single()
        userTier = (ctaUser?.tier as 'member' | 'pro' | 'admin') || 'member'
    }

    return (
        <div className="container">
            <Link href={`/subjects/${typedProblem.subject_id}`} className="back-link">
                ← {subject?.name || '문제 목록'}으로
            </Link>

            <div className="problem-header">
                <h1>{typedProblem.title}</h1>
                <div className="meta">
                    총 배점: {typedProblem.total_score}점 · 물음 {typedProblem.cta_subquestion.length}개
                </div>
            </div>

            {/* 사실관계 */}
            {(typedProblem.case_text_full || typedProblem.case_text_compact) && (
                <div>
                    <div className="case-text-label">📄 사실관계</div>
                    <div className="case-text">
                        {typedProblem.case_text_full || typedProblem.case_text_compact}
                    </div>
                </div>
            )}

            {/* 쟁점 */}
            {(typedProblem.issue_text_full || typedProblem.issue_text_compact) && (
                <div>
                    <div className="case-text-label">⚖️ 과세관청 처분(또는 쟁점)</div>
                    <div className="case-text">
                        {typedProblem.issue_text_full || typedProblem.issue_text_compact}
                    </div>
                </div>
            )}

            {/* 답안 입력 + 채점 결과 (Client Component) */}
            <AnswerForm problem={typedProblem} userTier={userTier} />
        </div>
    )
}
