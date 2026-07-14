'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function signup(formData: FormData) {
    const supabase = await createClient()
    const admin = createAdminClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const nickname = formData.get('nickname') as string

    if (!email || !email.includes('@')) {
        redirect('/signup?error=' + encodeURIComponent('올바른 이메일 주소를 입력해주세요.'))
    }

    if (!nickname || nickname.length < 2 || nickname.length > 12 || !/^[가-힣a-zA-Z0-9]+$/.test(nickname)) {
        redirect('/signup?error=' + encodeURIComponent('닉네임은 2~12자의 한글, 영문, 숫자만 가능합니다. (공백 및 @ 불가)'))
    }

    // 닉네임 중복 검사 (이미 가입된 닉네임인지 - 대소문자 무시)
    const { data: existingUser } = await admin
        .from('cta_user')
        .select('nickname')
        .ilike('nickname', nickname)
        .maybeSingle()

    if (existingUser) {
        redirect('/signup?error=' + encodeURIComponent('이미 사용 중인 닉네임입니다.'))
    }

    // origin 헤더 부재 시(일부 프록시 구성) localhost 링크가 메일로 발송되는 사고를 막기 위해
    // 배포 URL 환경변수를 중간 폴백으로 둔다
    const headersList = await headers()
    const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const { data: signupData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback`,
        },
    })

    if (error) {
        redirect('/signup?error=' + encodeURIComponent(error.message))
    }

    if (signupData.user) {
        // admin으로 cta_user upsert (닉네임 저장)
        const { error: upsertErr } = await admin
            .from('cta_user')
            .upsert({
                id: signupData.user.id,
                email: email,
                nickname: nickname,
            }, { onConflict: 'id' })

        if (upsertErr) {
            console.error('Failed to update nickname for user', signupData.user.id, upsertErr)
            revalidatePath('/', 'layout')
            redirect('/signup?message=' + encodeURIComponent('가입은 완료되었으나 닉네임 설정에 실패했습니다. 확인 이메일을 확인하여 로그인한 후 프로필에서 닉네임 설정을 마저 진행해 주세요.'))
        }
    }

    revalidatePath('/', 'layout')
    redirect('/signup?message=' + encodeURIComponent('확인 이메일을 확인해 주세요.'))
}
