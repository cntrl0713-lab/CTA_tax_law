import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // "next" 파라미터가 있으면 리다이렉트 URL로 사용
    let next = searchParams.get('next') ?? '/'
    if (!next.startsWith('/')) {
        next = '/'
    }

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'
            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`)
            } else {
                return NextResponse.redirect(`${origin}${next}`)
            }
        }
    }

    // 에러 발생 시 로그인 페이지로 리다이렉트.
    // 대표 케이스: 가입한 브라우저가 아닌 곳(폰 메일앱 등)에서 인증 링크를 열면 PKCE code verifier
    // 쿠키가 없어 교환이 실패하는데, 이때도 이메일 인증 자체는 이미 완료된 상태다 — "다시 시도"로
    // 안내하면 재시도 루프에 빠지므로 로그인 유도로 안내한다.
    return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent('이메일 인증이 완료되었을 수 있습니다. 로그인해 주세요.')}`)
}
