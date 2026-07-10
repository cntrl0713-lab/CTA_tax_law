import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProblemWithDetails } from '@/types/db'

interface PageProps {
    params: Promise<{ attemptId: string }>
}

export default async function ProblemResultPage({ params }: PageProps) {
    const { attemptId } = await params
    const supabase = createAdminClient()

    // 1. 채점 이력(Attempt) 조회
    const { data: attempt, error: attemptError } = await supabase
        .from('cta_grading_attempt')
        .select('*')
        .eq('id', attemptId)
        .single()

    if (attemptError || !attempt) {
        notFound()
    }

    // 2. 관련 문제 및 예하 소문항, 채점기준 조회
    const { data: problem, error: problemError } = await supabase
        .from('cta_problem')
        .select(`
            *,
            cta_subquestion (
                *,
                cta_subquestion_rubric (*)
            )
        `)
        .eq('id', attempt.problem_id)
        .single()

    if (problemError || !problem) {
        notFound()
    }

    const typedProblem = problem as ProblemWithDetails

    // 소문항 및 루브릭 정렬
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

    // 제출 답안 리스트 맵화
    const answersList = (attempt.answers_json || []) as { subquestionNumber: number; answerText: string }[]
    const answersMap: Record<number, string> = {}
    answersList.forEach((ans) => {
        answersMap[ans.subquestionNumber] = ans.answerText
    })

    // AI 채점 피드백 결과 리스트 맵화
    const resultData = attempt.result_json as {
        totalScore: number
        subquestions: {
            number: number
            awardedScore: number
            maxScore: number
            feedback: string
            rubricResults: {
                criterionName: string
                awardedScore: number
                maxScore: number
                met: boolean
            }[]
        }[]
        overallComment: string
    }

    const resultByNum = new Map(
        resultData?.subquestions?.map((r) => [r.number, r]) || []
    )

    return (
        <div className="container" style={{ maxWidth: '900px', margin: '40px auto' }}>
            <style>{`
                .rubric-details summary::-webkit-details-marker {
                    display: none;
                }
                .rubric-details summary {
                    list-style: none;
                }
                .rubric-details summary:focus {
                    outline: none;
                }
                .rubric-details[open] {
                    border-color: #cbd5e1 !important;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                }
            `}</style>
            <Link href={`/problems/${typedProblem.id}`} className="back-link">
                ← 문제풀이로 돌아가기
            </Link>

            {/* 메인 헤더 결과 요약 */}
            <div className="card" style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%)',
                color: '#fff',
                padding: '30px',
                borderRadius: '16px',
                marginBottom: '30px',
                boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.4)'
            }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '8px' }}>
                    {subject?.name || '세법'} · AI 채점 리포트
                </div>
                <h1 style={{ fontSize: '2rem', margin: '0 0 20px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px' }}>
                    {typedProblem.title}
                </h1>

                <div style={{ display: 'flex', gap: '30px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>나의 획득 점수</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '3rem', fontWeight: '800', color: '#60a5fa' }}>
                                {resultData?.totalScore ?? 0}
                            </span>
                            <span style={{ fontSize: '1.2rem', opacity: 0.8 }}>/ {typedProblem.total_score}점</span>
                        </div>
                    </div>

                    <div style={{
                        flex: '1',
                        minWidth: '250px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderLeft: '4px solid #60a5fa',
                        padding: '12px 18px',
                        borderRadius: '8px'
                    }}>
                        <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', pointerEvents: 'none', color: '#93c5fd', marginBottom: '4px' }}>
                            📋 AI 채점 총평
                        </span>
                        <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.5' }}>
                            {resultData?.overallComment || '평가가 제공되지 않았습니다.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 1. 사실관계 */}
            {(typedProblem.case_text_full || typedProblem.case_text_compact) && (
                <div style={{ marginBottom: '30px' }}>
                    <div className="case-text-label" style={{ fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📄 사실관계</span>
                    </div>
                    <div className="case-text" style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        color: '#344054',
                        padding: '20px',
                        borderRadius: '8px',
                        whiteSpace: 'pre-line'
                    }}>
                        {typedProblem.case_text_full || typedProblem.case_text_compact}
                    </div>
                </div>
            )}

            {/* 2. 과세관청 처분 또는 쟁점 */}
            {(typedProblem.issue_text_full || typedProblem.issue_text_compact) && (
                <div style={{ marginBottom: '40px' }}>
                    <div className="case-text-label" style={{ fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>⚖️ 과세관청 처분 및 쟁점</span>
                    </div>
                    <div className="case-text" style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        color: '#344054',
                        padding: '20px',
                        borderRadius: '8px',
                        whiteSpace: 'pre-line'
                    }}>
                        {typedProblem.issue_text_full || typedProblem.issue_text_compact}
                    </div>
                </div>
            )}

            <div style={{ borderTop: '2px solid #e2e8f0', margin: '40px 0 20px 0' }} />
            <h2 className="section-title" style={{ fontSize: '1.3rem', color: '#1e293b', marginBottom: '25px' }}>
                ✏️ 물음별 상세 채점 결과
            </h2>

            {/* 3, 4, 5. 물음별 내 답안 & 모범답안 및 채점기준 루프 */}
            {typedProblem.cta_subquestion.map((sq) => {
                const myAnswer = answersMap[sq.number] || '(미작성 또는 기재되지 않은 답안)';
                const feedbackData = resultByNum.get(sq.number);

                return (
                    <div key={sq.id} className="subquestion" style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '25px',
                        backgroundColor: '#fff',
                        marginBottom: '35px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}>
                        {/* 물음 헤더 */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid #f1f5f9',
                            paddingBottom: '12px',
                            marginBottom: '15px'
                        }}>
                            <div>
                                <span style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#0f172a' }}>
                                    물음 {sq.number}
                                </span>
                                <span style={{ marginLeft: '10px', fontSize: '0.85rem', color: '#64748b' }}>
                                    배점: {sq.score}점
                                </span>
                            </div>

                            <div style={{
                                backgroundColor: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1e40af',
                                padding: '4px 12px',
                                borderRadius: '20px',
                                fontSize: '0.9rem',
                                fontWeight: 'bold'
                            }}>
                                획득: {feedbackData?.awardedScore ?? 0}점
                            </div>
                        </div>

                        {/* 물음 지문 */}
                        {(sq.prompt_text_full || sq.prompt_text_compact) && (
                            <div style={{
                                backgroundColor: '#fdf2f8',
                                color: '#9d174d',
                                borderLeft: '3px solid #db2777',
                                padding: '10px 15px',
                                borderRadius: '4px',
                                fontSize: '0.92rem',
                                marginBottom: '20px',
                                fontWeight: '500'
                            }}>
                                {sq.prompt_text_full || sq.prompt_text_compact}
                            </div>
                        )}

                        {/* 내 답안 */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#475569', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>✍️ 나의 답안</span>
                            </div>
                            <div style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '15px',
                                fontSize: '0.95rem',
                                color: '#334155',
                                backgroundColor: '#fafafa',
                                whiteSpace: 'pre-wrap',
                                minHeight: '80px',
                                lineHeight: '1.5'
                            }}>
                                {myAnswer}
                            </div>
                        </div>

                        {/* 채점 기준 리스트 */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#475569', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>📏 채점 기준 및 모범답안 획득 여부</span>
                            </div>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {sq.cta_subquestion_rubric.map((rubric) => {
                                    const matchedRubric = feedbackData?.rubricResults?.find(
                                        (rr) => rr.criterionName === rubric.criterion_name
                                    );

                                    // 하위 호환성 확보: status 또는 boolean 타입의 met 모두 안전하게 파싱
                                    let status: 'met' | 'partially_met' | 'unmet' = 'unmet';
                                    if (matchedRubric) {
                                        if ('status' in matchedRubric) {
                                            status = (matchedRubric as any).status;
                                        } else if ('met' in matchedRubric) {
                                            status = (matchedRubric as any).met ? 'met' : 'unmet';
                                        }
                                    }

                                    const awarded = matchedRubric ? matchedRubric.awardedScore : 0;

                                    // 3단계 기호 및 디자인 속성 분기
                                    let indicatorChar = '✖';
                                    let indicatorColor = '#cbd5e1';
                                    let bgValColor = '#f8fafc';

                                    if (status === 'met') {
                                        indicatorChar = '●';
                                        indicatorColor = '#16a34a';
                                        bgValColor = '#f0fdf4';
                                    } else if (status === 'partially_met') {
                                        indicatorChar = '▲';
                                        indicatorColor = '#d97706';
                                        bgValColor = '#fffbeb';
                                    }

                                    return (
                                        <div key={rubric.id} style={{
                                            border: '1px solid #f1f5f9',
                                            borderRadius: '6px',
                                            backgroundColor: bgValColor,
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 15px',
                                                borderBottom: rubric.example_answer_text ? '1px solid #f1f5f9' : 'none'
                                            }}>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                    <span style={{
                                                        color: indicatorColor,
                                                        fontWeight: 'bold',
                                                        fontSize: '1.1rem',
                                                        width: '20px',
                                                        textAlign: 'center'
                                                    }}>
                                                        {indicatorChar}
                                                    </span>
                                                    <div>
                                                        <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#1e293b' }}>
                                                            {rubric.criterion_name}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}>
                                                        {awarded} / {rubric.max_score}점
                                                    </span>
                                                </div>
                                            </div>
                                            {rubric.example_answer_text && (
                                                <div style={{
                                                    padding: '15px',
                                                    backgroundColor: '#ffffff',
                                                    fontSize: '0.88rem',
                                                    color: '#334155'
                                                }}>
                                                    <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '12px' }}>
                                                        <span style={{ fontWeight: 'bold', color: '#1e3a8a', display: 'block', marginBottom: '4px' }}>🎯 모범답안</span>
                                                        <p style={{ margin: 0, color: '#1e3a8a', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{rubric.example_answer_text}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 개별 피드백 */}
                        {feedbackData?.feedback && (
                            <div style={{
                                backgroundColor: '#f0f9ff',
                                border: '1px solid #bae6fd',
                                padding: '12px 15px',
                                borderRadius: '6px',
                                color: '#0369a1',
                                fontSize: '0.88rem',
                                lineHeight: '1.5'
                            }}>
                                💡 **물음 피드백**: {feedbackData.feedback}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* 하단 제어 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px', gap: '15px' }}>
                <Link href="/" className="btn btn-secondary">
                    목록으로 돌아가기
                </Link>
            </div>
        </div>
    )
}
