import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GradingAttempt } from '@/types/db'

export default async function NotesPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>
}) {
    const { type } = await searchParams
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user || user.is_anonymous) redirect('/login')

    // 오답노트 목록 조회
    const admin = createAdminClient()
    let query = admin
        .from('cta_grading_attempt')
        .select(`
            id, created_at, note_saved_at, hint_used,
            result_json,
            cta_problem!inner ( id, title, total_score, subject_id, problem_type,
                cta_subject!inner ( id, name )
            )
        `)
        .eq('user_id', user.id)
        .eq('is_saved_note', true)

    if (type === 'case' || type === 'theory') {
        query = query.eq('cta_problem.problem_type', type)
    }

    const { data: notes } = await query
        .order('note_saved_at', { ascending: false })
        .limit(100)

    const typedNotes = (notes || []) as unknown as (GradingAttempt & {
        cta_problem: { id: number; title: string; total_score: number; problem_type: 'case' | 'theory'; cta_subject: { id: number; name: string } }
    })[]

    return (
        <div className="notes-page">
            <h2 className="notes-title">📒 오답노트</h2>

            <div className="type-tabs">
                <Link
                    href="/mypage/notes"
                    className={`type-tab ${!type ? 'active' : ''}`}
                >
                    전체
                </Link>
                <Link
                    href="/mypage/notes?type=case"
                    className={`type-tab ${type === 'case' ? 'active' : ''}`}
                >
                    📋 사례형
                </Link>
                <Link
                    href="/mypage/notes?type=theory"
                    className={`type-tab ${type === 'theory' ? 'active' : ''}`}
                >
                    📚 이론형
                </Link>
            </div>
            {typedNotes.length === 0 ? (
                <div className="notes-empty">
                    <p>저장된 오답노트가 없습니다.</p>
                    <p>채점 결과 페이지에서 &apos;오답노트에 저장&apos; 버튼을 눌러보세요.</p>
                </div>
            ) : (
                <div className="notes-list">
                    {typedNotes.map((note) => {
                        const subject = note.cta_problem?.cta_subject
                        const score = note.result_json?.totalScore ?? 0
                        const maxScore = note.cta_problem?.total_score ?? 0
                        const savedDate = note.note_saved_at
                            ? new Date(note.note_saved_at).toLocaleDateString('ko-KR')
                            : '-'

                        return (
                            <Link
                                key={note.id}
                                href={`/problems/result/${note.id}`}
                                className="note-card"
                            >
                                <div className="note-card-subject">
                                    {note.cta_problem?.problem_type === 'theory' ? (
                                        <span className="type-badge type-badge-theory">📚 이론</span>
                                    ) : (
                                        <span className="type-badge type-badge-case">📋 사례</span>
                                    )}
                                    {subject?.name ?? '세법'}
                                </div>
                                <div className="note-card-title">{note.cta_problem?.title}</div>
                                <div className="note-card-meta">
                                    <span className="note-score">
                                        {score} / {maxScore}점
                                    </span>
                                    {note.hint_used && (
                                        <span className="note-hint-badge">힌트 사용</span>
                                    )}
                                    <span className="note-date">저장일: {savedDate}</span>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
