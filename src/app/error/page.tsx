export default function ErrorPage() {
    return (
        <div className="login-container">
            <div className="login-card" style={{ textAlign: 'center' }}>
                <h1>⚠️ 오류</h1>
                <p>문제가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
                <a href="/" className="btn btn-primary" style={{ marginTop: '20px', display: 'inline-block' }}>
                    홈으로 돌아가기
                </a>
            </div>
        </div>
    )
}
