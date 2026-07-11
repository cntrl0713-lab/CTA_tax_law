'use client'

import { useState, useEffect } from 'react'
import type { StatsPeriod, StatsResponse, SubjectStats } from '@/types/stats'

export default function StatsView() {
    const [period, setPeriod] = useState<StatsPeriod>('weekly')
    const [data, setData] = useState<StatsResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true)
            setError(null)
            try {
                const res = await fetch(`/api/stats?period=${period}`)
                const json = await res.json()
                if (!res.ok) throw new Error(json.error)
                setData(json)
            } catch (err) {
                setError(err instanceof Error ? err.message : '통계 조회에 실패했습니다.')
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [period])

    const tabs: { label: string; value: StatsPeriod }[] = [
        { label: '주간', value: 'weekly' },
        { label: '월간', value: 'monthly' },
        { label: '누적', value: 'all' },
    ]

    return (
        <div className="stats-view">
            <h2 className="stats-title">📊 학습 통계</h2>

            {/* 탭 */}
            <div className="stats-tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab.value}
                        className={`stats-tab ${period === tab.value ? 'active' : ''}`}
                        onClick={() => setPeriod(tab.value)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading && <div className="stats-loading">불러오는 중...</div>}
            {error && <div className="stats-error">{error}</div>}

            {data && !loading && (
                <>
                    {/* 누적: 획득 점수만 표시 */}
                    {period === 'all' ? (
                        <div className="stats-all">
                            <div className="stats-overall-all">
                                <div className="stats-label">전체 누적 획득 점수</div>
                                <div className="stats-score-big">{data.overall.awardedSum.toLocaleString()}점</div>
                            </div>
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>과목</th>
                                        <th>획득 점수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.bySubject.map((s: SubjectStats) => (
                                        <tr key={s.subjectId}>
                                            <td>{s.subjectName}</td>
                                            <td>{s.awardedSum.toLocaleString()}점</td>
                                        </tr>
                                    ))}
                                    {data.bySubject.length === 0 && (
                                        <tr>
                                            <td colSpan={2} style={{ textAlign: 'center', color: '#888' }}>
                                                채점 기록이 없습니다.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* 주간/월간: 전체 지표 표시 */
                        <div className="stats-period">
                            <div className="stats-overall">
                                <div className="stats-overall-item">
                                    <span className="stats-label">획득 점수</span>
                                    <span className="stats-value">{data.overall.awardedSum}점</span>
                                </div>
                                <div className="stats-overall-item">
                                    <span className="stats-label">총점</span>
                                    <span className="stats-value">{data.overall.maxSum}점</span>
                                </div>
                                <div className="stats-overall-item">
                                    <span className="stats-label">득점률</span>
                                    <span className="stats-value">
                                        {data.overall.maxSum > 0
                                            ? `${(data.overall.ratio * 100).toFixed(1)}%`
                                            : '-'}
                                    </span>
                                </div>
                                <div className="stats-overall-item">
                                    <span className="stats-label">시도 횟수</span>
                                    <span className="stats-value">{data.overall.count}회</span>
                                </div>
                            </div>
                            <table className="stats-table">
                                <thead>
                                    <tr>
                                        <th>과목</th>
                                        <th>획득</th>
                                        <th>총점</th>
                                        <th>득점률</th>
                                        <th>횟수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.bySubject.map((s: SubjectStats) => (
                                        <tr key={s.subjectId}>
                                            <td>{s.subjectName}</td>
                                            <td>{s.awardedSum}점</td>
                                            <td>{s.maxSum}점</td>
                                            <td>
                                                {s.maxSum > 0
                                                    ? `${(s.ratio * 100).toFixed(1)}%`
                                                    : '-'}
                                            </td>
                                            <td>{s.count}회</td>
                                        </tr>
                                    ))}
                                    {data.bySubject.length === 0 && (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', color: '#888' }}>
                                                해당 기간의 채점 기록이 없습니다.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
