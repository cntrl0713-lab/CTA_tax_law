import { getMonthlyRanking, getKstMonthBounds } from '@/lib/ranking'
import { maskEmail } from '@/lib/maskEmail'

export default async function RankingPage() {
    const top100 = await getMonthlyRanking(100)

    const { year, month } = getKstMonthBounds()

    return (
        <div className="ranking-container">
            <div className="ranking-header">
                <h1>🏆 이달의 랭킹 (Top 100)</h1>
                <p>
                    {year}년 {month}월 기준 순위입니다. <br />
                    (문제별 득점 중 최고점만 합산 산정, 매월 1일 자정 리셋)
                </p>
            </div>

            <div className="ranking-board">
                {top100.length === 0 ? (
                    <div className="ranking-empty">
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                        <p>아직 이번 달 랭킹 기록이 없습니다.<br />문제를 풀고 랭킹의 주인공이 되어보세요!</p>
                    </div>
                ) : (
                    <table className="ranking-table">
                        <thead>
                            <tr>
                                <th style={{ width: '80px', textAlign: 'center' }}>순위</th>
                                <th>사용자</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>합산 점수</th>
                            </tr>
                        </thead>
                        <tbody>
                            {top100.map((entry, idx) => (
                                <tr key={entry.user_id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                                    <td style={{ padding: '1rem', textAlign: 'center', fontWeight: idx < 3 ? 'bold' : 'normal', fontSize: idx < 3 ? '1.2rem' : '1rem' }}>
                                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                    </td>
                                    <td style={{ padding: '1rem', fontWeight: 500 }}>
                                        {entry.nickname ? entry.nickname : maskEmail(entry.email)}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--accent-primary)', fontWeight: 'bold' }}>
                                        {entry.total_score}점
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
