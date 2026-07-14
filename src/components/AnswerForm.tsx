'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProblemWithDetails } from '@/types/db'
import type { GradeResponse } from '@/types/grading'
import type { HintResponse, AnswerRevealResponse } from '@/types/hint'
import { isLocallySkippable } from '@/lib/grading-skip'
import GradingResult from './GradingResult'

interface AnswerFormProps {
    problem: ProblemWithDetails
    userTier?: 'guest' | 'member' | 'pro' | 'admin'
}

export default function AnswerForm({ problem, userTier = 'guest' }: AnswerFormProps) {
    const router = useRouter()
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<GradeResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

    // 힌트/정답은 문제 단위로 1회 조회
    const [hint, setHint] = useState<HintResponse | null>(null)
    const [hintLoading, setHintLoading] = useState(false)
    const [answerReveal, setAnswerReveal] = useState<AnswerRevealResponse | null>(null)
    const [answerLoading, setAnswerLoading] = useState(false)

    const canUseHint = ['member', 'pro', 'admin'].includes(userTier)

    const handleAnswerChange = (subquestionNumber: number, text: string) => {
        setAnswers((prev) => ({ ...prev, [subquestionNumber]: text }))
    }

    /** 힌트보기 (문제 단위) */
    const handleHint = async () => {
        setHintLoading(true)
        try {
            const res = await fetch('/api/hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problemId: problem.id }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setHint(data)
        } catch (err) {
            alert(err instanceof Error ? err.message : '힌트 조회에 실패했습니다.')
        } finally {
            setHintLoading(false)
        }
    }

    /** 정답보기 (문제 단위, 힌트 확인 후 활성화) */
    const handleAnswerReveal = async () => {
        setAnswerLoading(true)
        try {
            const res = await fetch('/api/answer-reveal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problemId: problem.id }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setAnswerReveal(data)
        } catch (err) {
            alert(err instanceof Error ? err.message : '정답 조회에 실패했습니다.')
        } finally {
            setAnswerLoading(false)
        }
    }

    const handleSubmit = async () => {
        // 판정 기준은 src/lib/grading-skip.ts의 isLocallySkippable이 단일 원천.
        // 서버가 실제 판정 원천이고 여기서는 사용자 안내 및 불필요한 제출 사전 차단용.
        const subquestionsChecked = problem.cta_subquestion.map((sq) => {
            const text = answers[sq.number] || ''
            const result = isLocallySkippable(text)
            return { number: sq.number, willSkip: result.skip }
        })

        const allSkipped = subquestionsChecked.every((sq) => sq.willSkip)
        if (allSkipped) {
            setError('모든 물음의 답안이 채점 불가 상태입니다(너무 짧거나 단순 반복 문자). 최소 한 물음은 유의미한 내용을 작성해야 채점이 가능합니다.')
            return
        }

        const skippedSqs = subquestionsChecked.filter((sq) => sq.willSkip)
        if (skippedSqs.length > 0) {
            const nums = skippedSqs.map((sq) => sq.number).join(', ')
            const proceed = confirm(`물음 ${nums}은(는) 답안이 너무 짧거나 반복 문자여서 0점 처리됩니다. 채점 횟수는 1회 차감됩니다. 그래도 채점할까요?`)
            if (!proceed) {
                return
            }
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
            {problem.cta_subquestion.map((sq) => (
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
            ))}

            {/* 힌트/정답보기 (member 이상, 문제 단위) */}
            {canUseHint && (
                <div className="assist-area">
                    <div className="assist-buttons">
                        {!hint ? (
                            <button
                                className="btn btn-hint"
                                onClick={handleHint}
                                disabled={hintLoading}
                            >
                                {hintLoading ? '로딩 중...' : '💡 힌트보기'}
                            </button>
                        ) : (
                            <button
                                className="btn btn-answer-reveal"
                                onClick={handleAnswerReveal}
                                disabled={answerLoading || !!answerReveal}
                            >
                                {answerLoading ? '로딩 중...' : '📖 정답보기'}
                            </button>
                        )}
                    </div>

                    {/* 힌트 패널: 물음별 키워드 */}
                    {hint && (
                        <div className="hint-panel">
                            <div className="hint-panel-title">💡 물음별 핵심 키워드</div>
                            {hint.subquestions.map((sq) => (
                                <div key={sq.number} className="hint-sq">
                                    <span className="hint-sq-label">물음 {sq.number}</span>
                                    <div className="hint-keywords">
                                        {sq.keywords.length > 0
                                            ? sq.keywords.map((kw, i) => (
                                                <span key={i} className="hint-keyword-chip">{kw}</span>
                                            ))
                                            : <span className="hint-empty">등록된 키워드가 없습니다.</span>
                                        }
                                    </div>
                                </div>
                            ))}
                            <span className="hint-remaining">오늘 남은 힌트: {hint.remainingToday}개 문제</span>
                        </div>
                    )}

                    {/* 정답 패널: 물음별 모범답안 */}
                    {answerReveal && (
                        <div className="answer-reveal-panel">
                            <div className="answer-reveal-title">📖 물음별 모범답안 기준</div>
                            {answerReveal.subquestions.map((sq) => (
                                <div key={sq.number} className="answer-sq">
                                    <span className="answer-sq-label">물음 {sq.number}</span>
                                    {sq.rubrics.map((r, i) => (
                                        <div key={i} className="answer-reveal-item">
                                            <div className="answer-reveal-criterion">{r.criterionName}</div>
                                            {r.exampleAnswerText && (
                                                <div className="answer-reveal-text">{r.exampleAnswerText}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}
                            <span className="hint-remaining">오늘 남은 정답: {answerReveal.remainingToday}개 문제</span>
                        </div>
                    )}
                </div>
            )}

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
