import Link from 'next/link'
import { login, startAsGuest } from './actions'

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>
}) {
    const params = await searchParams

    return (
        <div className="landing-page">
            {/* 히어로 영역 */}
            <div className="landing-hero">
                <div className="landing-hero-badge">🏛️ 세무사 시험 대비</div>
                <h1 className="landing-hero-title">
                    세법 AI 채점 플랫폼
                </h1>
                <p className="landing-hero-desc">
                    사례형 세법 문제를 풀고, AI가 루브릭 기반으로<br />
                    즉시 채점하고 상세 피드백을 제공합니다.
                </p>
                <div className="landing-features">
                    <div className="landing-feature">
                        <span className="landing-feature-icon">📝</span>
                        <span>실전 사례형 문제</span>
                    </div>
                    <div className="landing-feature">
                        <span className="landing-feature-icon">🤖</span>
                        <span>AI 루브릭 채점</span>
                    </div>
                    <div className="landing-feature">
                        <span className="landing-feature-icon">💡</span>
                        <span>소문항별 피드백</span>
                    </div>
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
                                아이디 또는 이메일
                            </label>
                            <input
                                className="form-input"
                                id="email"
                                name="email"
                                type="text"
                                placeholder="아이디 또는 you@example.com"
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
