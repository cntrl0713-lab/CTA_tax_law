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

    // 에러 발생 시 로그인 페이지로 리다이렉트
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('인증에 실패했습니다. 다시 시도해 주세요.')}`)
}
