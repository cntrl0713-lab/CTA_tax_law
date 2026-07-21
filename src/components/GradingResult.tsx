import type { GradeResponse } from '@/types/grading'

interface GradingResultProps {
    result: GradeResponse
}

export default function GradingResult({ result }: GradingResultProps) {
    const scorePercent = Math.round((result.totalScore / result.maxScore) * 100)

    return (
        <div className="grading-result">
            {/* 총점 요약 */}
            <div className="result-summary">
                <div className="result-total-score">
                    {result.totalScore}
                    <span className="result-max-score"> / {result.maxScore}점</span>
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    득점률 {scorePercent}%
                </div>
                <div className="result-overall-comment">{result.overallComment}</div>
            </div>

            {/* 물음별 결과 */}
            {result.subquestions.map((sq) => (
                <div key={sq.number} className="result-subquestion">
                    <div className="result-sq-header">
                        <span className="subquestion-number">물음 {sq.number}</span>
                        <span className="result-sq-score">
                            {sq.awardedScore} / {sq.maxScore}점
                        </span>
                    </div>
                    <div className="result-sq-feedback">{sq.feedback}</div>

                    {/* 루브릭별 결과 */}
                    <div className="rubric-list">
                        {sq.rubricResults.map((rubric, idx) => (
                            <div
                                key={idx}
                                className={`rubric-item ${rubric.status === 'met' ? 'rubric-met' : rubric.status === 'partially_met' ? 'rubric-partially-met' : 'rubric-not-met'}`}
                            >
                                <span className="rubric-icon">{rubric.status === 'met' ? '✅' : rubric.status === 'partially_met' ? '⚠️' : '❌'}</span>
                                <span className="rubric-name">{rubric.criterionName}</span>
                                <span className="rubric-score">
                                    {rubric.awardedScore}/{rubric.maxScore}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
