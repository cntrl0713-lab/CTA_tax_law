'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProblemWithDetails } from '@/types/db'
import type { GradeResponse } from '@/types/grading'
import GradingResult from './GradingResult'

interface AnswerFormProps {
    problem: ProblemWithDetails
    userTier?: 'guest' | 'member' | 'pro' | 'admin'
}

interface HintState {
    keywords: string[]
    remainingToday: number
    loading: boolean
    revealed: boolean
}

interface AnswerState {
    rubrics: { criterionName: string; exampleAnswerText: string | null }[]
    remainingToday: number
    loading: boolean
    revealed: boolean
}

export default function AnswerForm({ problem, userTier = 'guest' }: AnswerFormProps) {
    const router = useRouter()
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<GradeResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [hints, setHints] = useState<Record<number, HintState>>({})
    const [answerReveals, setAnswerReveals] = useState<Record<number, AnswerState>>({})

    const canUseHint = ['member', 'pro', 'admin'].includes(userTier)

    const handleAnswerChange = (subquestionNumber: number, text: string) => {
        setAnswers((prev) => ({ ...prev, [subquestionNumber]: text }))
    }

    /** 힌트보기 */
    const handleHint = async (sq: ProblemWithDetails['cta_subquestion'][number]) => {
        setHints((prev) => ({
            ...prev,
            [sq.id]: { ...(prev[sq.id] ?? { keywords: [], remainingToday: 0, revealed: false }), loading: true },
        }))
        try {
            const res = await fetch('/api/hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problemId: problem.id, subquestionId: sq.id }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setHints((prev) => ({
                ...prev,
                [sq.id]: { keywords: data.keywords, remainingToday: data.remainingToday, loading: false, revealed: true },
            }))
        } catch (err) {
            alert(err instanceof Error ? err.message : '힌트 조회에 실패했습니다.')
            setHints((prev) => ({
                ...prev,
                [sq.id]: { ...(prev[sq.id] ?? { keywords: [], remainingToday: 0, revealed: false }), loading: false },
            }))
        }
    }

    /** 정답보기 */
    const handleAnswerReveal = async (sq: ProblemWithDetails['cta_subquestion'][number]) => {
        setAnswerReveals((prev) => ({
            ...prev,
            [sq.id]: { ...(prev[sq.id] ?? { rubrics: [], remainingToday: 0, revealed: false }), loading: true },
        }))
        try {
            const res = await fetch('/api/answer-reveal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problemId: problem.id, subquestionId: sq.id }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setAnswerReveals((prev) => ({
                ...prev,
                [sq.id]: { rubrics: data.rubrics, remainingToday: data.remainingToday, loading: false, revealed: true },
            }))
        } catch (err) {
            alert(err instanceof Error ? err.message : '정답 조회에 실패했습니다.')
            setAnswerReveals((prev) => ({
                ...prev,
                [sq.id]: { ...(prev[sq.id] ?? { rubrics: [], remainingToday: 0, revealed: false }), loading: false },
            }))
        }
    }

    const handleSubmit = async () => {
        const invalidSubquestions = problem.cta_subquestion.filter((sq) => {
            const text = answers[sq.number] || ''
            const trimmed = text.trim()
            if (trimmed.length < 30) return true
            const cleaned = trimmed.replace(/\s/g, '')
            const uniqueChars = new Set(cleaned).size
            return uniqueChars < 5
        })

        if (invalidSubquestions.length > 0) {
            setError(
                `물음 ${invalidSubquestions.map((sq) => sq.number).join(', ')}번의 답안이 너무 짧거나 단순 문자가 반복되었습니다. (최소 30자 이상 작성 및 유의미한 내용 필요)`
            )
            return
        }

        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const response = await fetch('/api/grade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    problemId: problem.id,
                    answers: problem.cta_subquestion.map((sq) => ({
                        subquestionNumber: sq.number,
                        answerText: answers[sq.number] || '',
                    })),
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || '채점 요청에 실패했습니다.')
            }

            const data = await response.json()
            if (data.attemptId) {
                router.push(`/problems/result/${data.attemptId}`)
            } else {
                throw new Error('채점 요청은 완료되었으나, 결과 ID를 받지 못했습니다.')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {/* 물음별 답안 입력 */}
            {problem.cta_subquestion.map((sq) => {
                const hint = hints[sq.id]
                const answerReveal = answerReveals[sq.id]

                return (
                    <div key={sq.id} className="subquestion">
                        <div className="subquestion-header">
                            <span className="subquestion-number">물음 {sq.number}</span>
                            <span className="subquestion-score">배점: {sq.score}점</span>
                        </div>
                        {(sq.prompt_text_full || sq.prompt_text_compact) && (
                            <div className="subquestion-prompt">
                                {sq.prompt_text_full || sq.prompt_text_compact}
                            </div>
                        )}

                        {/* 힌트/정답보기 버튼 (member 이상) */}
                        {canUseHint && (
                            <div className="hint-action-row">
                                {/* 힌트보기 */}
                                {!hint?.revealed ? (
                                    <button
                                        className="btn btn-hint"
                                        onClick={() => handleHint(sq)}
                                        disabled={hint?.loading}
                                    >
                                        {hint?.loading ? '로딩 중...' : '💡 힌트보기'}
                                    </button>
                                ) : (
                                    <div className="hint-panel">
                                        <div className="hint-panel-title">💡 핵심 키워드</div>
                                        <div className="hint-keywords">
                                            {hint.keywords.length > 0
                                                ? hint.keywords.map((kw, i) => (
                                                    <span key={i} className="hint-keyword-chip">{kw}</span>
                                                ))
                                                : <span className="hint-empty">등록된 키워드가 없습니다.</span>
                                            }
                                        </div>
                                        <span className="hint-remaining">오늘 남은 횟수: {hint.remainingToday}회</span>
                                    </div>
                                )}

                                {/* 정답보기 (힌트 확인 후 활성화) */}
                                {hint?.revealed && !answerReveal?.revealed && (
                                    <button
                                        className="btn btn-answer-reveal"
                                        onClick={() => handleAnswerReveal(sq)}
                                        disabled={answerReveal?.loading}
                                    >
                                        {answerReveal?.loading ? '로딩 중...' : '📖 정답보기'}
                                    </button>
                                )}

                                {/* 정답 패널 */}
                                {answerReveal?.revealed && (
                                    <div className="answer-reveal-panel">
                                        <div className="answer-reveal-title">📖 모범 답안 기준</div>
                                        {answerReveal.rubrics.map((r, i) => (
                                            <div key={i} className="answer-reveal-item">
                                                <div className="answer-reveal-criterion">{r.criterionName}</div>
                                                {r.exampleAnswerText && (
                                                    <div className="answer-reveal-text">{r.exampleAnswerText}</div>
                                                )}
                                            </div>
                                        ))}
                                        <span className="hint-remaining">오늘 남은 횟수: {answerReveal.remainingToday}회</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <textarea
                            className="answer-textarea"
                            placeholder={`물음 ${sq.number}에 대한 답안을 작성하세요...`}
                            value={answers[sq.number] || ''}
                            onChange={(e) => handleAnswerChange(sq.number, e.target.value)}
                            disabled={loading}
                            maxLength={5000}
                        />
                        <div className="answer-char-count">
                            {(answers[sq.number] || '').length} / 5,000자
                        </div>
                    </div>
                )
            })}

            {/* 에러 메시지 */}
            {error && <div className="form-message error">{error}</div>}

            {/* 채점 버튼 */}
            <div className="submit-area">
                <button
                    className="btn btn-primary btn-lg"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? '채점 중...' : '🎯 채점하기'}
                </button>
            </div>

            {/* 로딩 */}
            {loading && (
                <div className="loading-overlay">
                    <div className="spinner" />
                    <div className="loading-text">AI가 답안을 분석하고 있습니다...</div>
                </div>
            )}

            {/* 채점 결과 */}
            {result && <GradingResult result={result} />}
        </>
    )
}
