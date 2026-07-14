import Link from 'next/link'
import { login, startAsGuest } from './actions'
import { getMonthlyRanking } from '@/lib/ranking'
import { maskEmail } from '@/lib/maskEmail'

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>
}) {
    const params = await searchParams
    const top10 = await getMonthlyRanking(10)

    return (
        <div className="landing-page">
            {/* 히어로 영역 */}
            <div className="landing-hero">
                <div className="landing-hero-badge">🏛️ 세무사 시험 대비</div>
                <h1 className="landing-hero-title">
                    세법 AI 채점 플랫폼
                </h1>
                <p className="landing-hero-desc">
                    사례형 세법 문제를 풀고, AI가 설정된 채점 기준에 따라<br />
                    즉시 부분 채점하고 상세 피드백을 제공합니다.
                </p>
                <div className="landing-features">
                    <div className="landing-feature">
                        <span className="landing-feature-icon">📝</span>
                        <span>실전 사례형 문제</span>
                    </div>
                    <div className="landing-feature">
                        <span className="landing-feature-icon">🤖</span>
                        <span>AI 부분 채점</span>
                    </div>
                    <div className="landing-feature">
                        <span className="landing-feature-icon">💡</span>
                        <span>소문항별 피드백</span>
                    </div>
                </div>

                {/* 랭킹 위젯 추가 */}
                <div className="ranking-widget" style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>🏆 이달의 랭킹 Top 10</span>
                        <Link href="/ranking" style={{ fontSize: '0.875rem', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 'normal' }}>전체 보기 →</Link>
                    </h3>
                    {top10.length === 0 ? (
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>아직 이번 달 랭킹 기록이 없습니다.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '0.5rem', fontWeight: 'normal' }}>순위</th>
                                    <th style={{ padding: '0.5rem', fontWeight: 'normal' }}>사용자</th>
                                    <th style={{ padding: '0.5rem', fontWeight: 'normal', textAlign: 'right' }}>점수</th>
                                </tr>
                            </thead>
                            <tbody>
                                {top10.map((entry, idx) => (
                                    <tr key={entry.user_id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                                        <td style={{ padding: '0.5rem' }}>{idx + 1}</td>
                                        <td style={{ padding: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {entry.nickname ? entry.nickname : maskEmail(entry.email)}
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--accent-primary)', fontWeight: 'bold' }}>{entry.total_score}점</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* 로그인 카드 */}
            <div className="landing-auth">
                <div className="login-card">
                    <h2 className="login-card-title">로그인</h2>
                    <p className="login-card-desc">계정에 로그인하여 학습을 시작하세요</p>

                    {params.error && (
                        <div className="form-message error">{params.error}</div>
                    )}
                    {params.message && (
                        <div className="form-message success">{params.message}</div>
                    )}

                    <form>
                        <div className="form-group">
                            <label className="form-label" htmlFor="email">
                                이메일 또는 닉네임
                            </label>
                            <input
                                className="form-input"
                                id="email"
                                name="email"
                                type="text"
                                placeholder="you@example.com 또는 닉네임"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="password">
                                비밀번호
                            </label>
                            <input
                                className="form-input"
                                id="password"
                                name="password"
                                type="password"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <div className="login-buttons">
                            <button className="btn btn-primary btn-login" formAction={login}>
                                로그인
                            </button>
                        </div>
                    </form>

                    <div className="login-divider">
                        <span>또는</span>
                    </div>

                    <Link href="/signup" className="btn btn-signup">
                        ✨ 새 계정 만들기
                    </Link>

                    <form style={{ marginTop: '12px' }}>
                        <button className="btn btn-guest" formAction={startAsGuest}>
                            👤 비회원으로 시작하기
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
