import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * 서버 전용 Admin 클라이언트.
 * Service Role Key를 사용하여 RLS를 우회합니다.
 * ⚠️ 절대로 클라이언트(브라우저)에서 사용하지 마세요.
 */
export function createAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}
