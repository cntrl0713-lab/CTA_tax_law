import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'

export default async function SubjectPage({
    params,
    searchParams,
}: {
    params: Promise<{ subjectId: string }>
    searchParams: Promise<{ type?: string }>
}) {
    const { subjectId } = await params
    const { type } = await searchParams
    const problemType = type === 'theory' ? 'theory' : 'case'
    const supabase = createAdminClient()

    // 과목 정보 조회
    const { data: subject } = await supabase
        .from('cta_subject')
        .select('*')
        .eq('id', Number(subjectId))
        .single()

    if (!subject) {
        notFound()
    }

    // 해당 과목의 문제 목록 조회
    const { data: problems } = await supabase
        .from('cta_problem')
        .select('id, title, total_score, issue_text_compact, problem_type, cta_subquestion(count)')
        .eq('subject_id', Number(subjectId))
        .eq('problem_type', problemType)
        .order('id')

    return (
        <div className="container">
            <Link href="/" className="back-link">
                ← 과목 목록으로
            </Link>

            <h1 className="section-title">{subject.name}</h1>

            <div className="type-tabs">
                <Link
                    href={`/subjects/${subjectId}?type=case`}
                    className={`type-tab ${problemType === 'case' ? 'active' : ''}`}
                >
                    📋 사례형
                </Link>
                <Link
                    href={`/subjects/${subjectId}?type=theory`}
                    className={`type-tab ${problemType === 'theory' ? 'active' : ''}`}
                >
                    📚 이론형
                </Link>
            </div>

            {!problems || problems.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <p>{problemType === 'theory' ? '등록된 이론형 문제가 없습니다.' : '등록된 문제가 없습니다.'}</p>
                </div>
            ) : (
                <div className="grid grid-1">
                    {problems.map((problem) => (
                        <Link
                            key={problem.id}
                            href={`/problems/${problem.id}?type=${problemType}`}
                            className="card-link"
                        >
                            <div className="card problem-card">
                                <div>
                                    <div className="problem-title">{problem.title}</div>
                                    <div className="problem-meta">
                                        {problem.problem_type === 'theory' ? (
                                            `물음 ${problem.cta_subquestion?.[0]?.count || 0}개 · 총 ${problem.total_score}점`
                                        ) : problem.issue_text_compact && (
                                            problem.issue_text_compact.length > 80
                                                ? problem.issue_text_compact.slice(0, 80) + '…'
                                                : problem.issue_text_compact
                                        )}
                                    </div>
                                </div>
                                {problem.problem_type === 'case' && (
                                    <div className="problem-score">{problem.total_score}점</div>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
