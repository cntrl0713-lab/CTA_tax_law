'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProblemWithDetails } from '@/types/db'
import type { GradeResponse } from '@/types/grading'
import GradingResult from './GradingResult'

interface AnswerFormProps {
    problem: ProblemWithDetails
}

export default function AnswerForm({ problem }: AnswerFormProps) {
    const router = useRouter()
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<GradeResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleAnswerChange = (subquestionNumber: number, text: string) => {
        setAnswers((prev) => ({ ...prev, [subquestionNumber]: text }))
    }

    const handleSubmit = async () => {
        // 기본 검증: 모든 소문항에 최소 30자 이상 & 단순 반복 입력 방지
        const invalidSubquestions = problem.cta_subquestion.filter((sq) => {
            const text = answers[sq.number] || ''
            const trimmed = text.trim()
            if (trimmed.length < 30) return true

            // 공백을 제외한 고유 문자 수가 5개 미만인 경우 단순 도배/무의미한 입력으로 간주
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
                // 성공 시 채점결과 전용 상세 페이지로 넘어갑니다.
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
