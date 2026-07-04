import Link from 'next/link'
import { login } from './actions'

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>
}) {
    const params = await searchParams

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>로그인</h1>
                <p>세무사 AI 채점 서비스에 접속하세요</p>

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
                    <div className="form-actions" style={{ flexDirection: 'column', gap: '16px' }}>
                        <button className="btn btn-primary" style={{ width: '100%' }} formAction={login}>
                            로그인
                        </button>
                        <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                            아직 계정이 없으신가요?{' '}
                            <Link href="/signup" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
                                회원가입하기
                            </Link>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
