'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function login(formData: FormData) {
    const supabase = await createClient()

    let email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email.includes('@')) {
        // 닉네임으로 간주, admin 권한으로 이메일 매칭 조회
        const admin = createAdminClient()
        const { data: userRecord } = await admin
            .from('cta_user')
            .select('email')
            .ilike('nickname', email)
            .maybeSingle()

        if (!userRecord || !userRecord.email) {
            redirect('/login?error=' + encodeURIComponent('닉네임 또는 이메일을 확인해주세요.'))
        }
        email = userRecord.email
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        // 계정 존재 여부는 유추 불가하게 통일하되, 이메일 미인증만은 별도 안내
        // (안 하면 사용자가 비밀번호 오류로 오인해 재시도 루프에 빠짐)
        const message = error.message.toLowerCase().includes('not confirmed')
            ? '이메일 인증이 완료되지 않았습니다. 받은 편지함의 인증 메일을 확인해 주세요.'
            : '닉네임 또는 이메일을 확인해주세요.'
        redirect('/login?error=' + encodeURIComponent(message))
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

export async function startAsGuest() {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInAnonymously()

    if (error) {
        redirect('/login?error=' + encodeURIComponent(error.message))
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

