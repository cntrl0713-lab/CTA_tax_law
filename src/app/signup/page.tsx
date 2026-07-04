import Link from 'next/link'
import { signup } from './actions'

export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>
}) {
    const params = await searchParams

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>회원가입</h1>
                <p>새로운 계정을 생성하고 AI 채점 서비스를 만나보세요</p>

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
                        <button className="btn btn-primary" style={{ width: '100%' }} formAction={signup}>
                            회원가입하기
                        </button>
                        <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                            이미 계정이 있으신가요?{' '}
                            <Link href="/login" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
                                로그인하러 가기
                            </Link>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
