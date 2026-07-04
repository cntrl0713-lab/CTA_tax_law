import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()

    // 환경변수 바인딩 상태 디버그 로깅
    console.log('[SUPABASE CLIENT DEBUG] URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('[SUPABASE CLIENT DEBUG] Anon Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '존재함' : '누락됨')

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet, _headers) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Server Component에서 호출 시 무시 (middleware에서 세션 갱신 담당)
                    }
                },
            },
        }
    )
}
