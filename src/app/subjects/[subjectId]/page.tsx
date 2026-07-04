import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function SubjectPage({
    params,
}: {
    params: Promise<{ subjectId: string }>
}) {
    const { subjectId } = await params
    const supabase = await createClient()

    // 과목 정보 조회
    const { data: subject } = await supabase
        .from('subjects')
        .select('*')
        .eq('id', Number(subjectId))
        .single()

    if (!subject) {
        notFound()
    }

    // 해당 과목의 문제 목록 조회
    const { data: problems } = await supabase
        .from('problems')
        .select('id, title, total_score, issue_text_compact')
        .eq('subject_id', Number(subjectId))
        .order('id')

    return (
        <div className="container">
            <Link href="/" className="back-link">
                ← 과목 목록으로
            </Link>

            <h1 className="section-title">{subject.name}</h1>

            {!problems || problems.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <p>등록된 문제가 없습니다.</p>
                </div>
            ) : (
                <div className="grid grid-1">
                    {problems.map((problem) => (
                        <Link
                            key={problem.id}
                            href={`/problems/${problem.id}`}
                            className="card-link"
                        >
                            <div className="card problem-card">
                                <div>
                                    <div className="problem-title">{problem.title}</div>
                                    {problem.issue_text_compact && (
                                        <div className="problem-meta">
                                            {problem.issue_text_compact.length > 80
                                                ? problem.issue_text_compact.slice(0, 80) + '…'
                                                : problem.issue_text_compact}
                                        </div>
                                    )}
                                </div>
                                <div className="problem-score">{problem.total_score}점</div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
