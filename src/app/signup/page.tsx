import Link from 'next/link'
import { signup } from './actions'

export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>
}) {
    const params = await searchParams

    return (
        <div className="landing-page">
            {/* 히어로 영역 */}
            <div className="landing-hero">
                <div className="landing-hero-badge">🎓 지금 시작하세요</div>
                <h1 className="landing-hero-title">
                    무료 계정 만들기
                </h1>
                <p className="landing-hero-desc">
                    회원가입 후 바로 세법 문제 풀이와<br />
                    AI 채점 서비스를 이용할 수 있습니다.
                </p>
                <div className="landing-features">
                    <div className="landing-feature">
                        <span className="landing-feature-icon">✅</span>
                        <span>간편한 가입</span>
                    </div>
                    <div className="landing-feature">
                        <span className="landing-feature-icon">🔓</span>
                        <span>전 과목 무제한</span>
                    </div>
                    <div className="landing-feature">
                        <span className="landing-feature-icon">📊</span>
                        <span>학습 기록 저장</span>
                    </div>
                </div>
            </div>

            {/* 회원가입 카드 */}
            <div className="landing-auth">
                <div className="login-card">
                    <h2 className="login-card-title">회원가입</h2>
                    <p className="login-card-desc">새로운 계정을 생성하세요</p>

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
                                placeholder="6자 이상 입력해 주세요"
                                required
                            />
                        </div>
                        <div className="login-buttons">
                            <button className="btn btn-primary btn-login" formAction={signup}>
                                회원가입하기
                            </button>
                        </div>
                    </form>

                    <div className="login-divider">
                        <span>이미 계정이 있으신가요?</span>
                    </div>

                    <Link href="/login" className="btn btn-back-login">
                        ← 로그인으로 돌아가기
                    </Link>
                </div>
            </div>
        </div>
    )
}
