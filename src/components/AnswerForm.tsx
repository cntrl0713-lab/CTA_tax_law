'use client'

import { useState } from 'react'
import type { ProblemWithDetails } from '@/types/db'
import type { GradeResponse } from '@/types/grading'
import GradingResult from './GradingResult'

interface AnswerFormProps {
    problem: ProblemWithDetails
}

export default function AnswerForm({ problem }: AnswerFormProps) {
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<GradeResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleAnswerChange = (subquestionNumber: number, text: string) => {
        setAnswers((prev) => ({ ...prev, [subquestionNumber]: text }))
    }

    const handleSubmit = async () => {
        // 기본 검증: 모든 소문항에 최소 10자 이상
        const emptySubquestions = problem.subquestions.filter(
            (sq) => !answers[sq.number] || answers[sq.number].trim().length < 10
        )

        if (emptySubquestions.length > 0) {
            setError(
                `물음 ${emptySubquestions.map((sq) => sq.number).join(', ')}번의 답안이 너무 짧습니다. (최소 10자)`
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
                    answers: problem.subquestions.map((sq) => ({
                        subquestionNumber: sq.number,
                        answerText: answers[sq.number] || '',
                    })),
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || '채점 요청에 실패했습니다.')
            }

            const data: GradeResponse = await response.json()
            setResult(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {/* 물음별 답안 입력 */}
            {problem.subquestions.map((sq) => (
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
