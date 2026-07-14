'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function updateProfile(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.is_anonymous) {
        redirect('/login')
    }

    const nickname = formData.get('nickname') as string

    if (!nickname || nickname.length < 2 || nickname.length > 12 || !/^[가-힣a-zA-Z0-9]+$/.test(nickname)) {
        redirect('/mypage/profile?error=' + encodeURIComponent('닉네임은 2~12자의 한글, 영문, 숫자만 가능합니다. (공백 및 @ 불가)'))
    }

    const admin = createAdminClient()

    // 닉네임 중복 검사 (본인 제외)
    const { data: existingUser } = await admin
        .from('cta_user')
        .select('id')
        .ilike('nickname', nickname)
        .neq('id', user.id)
        .maybeSingle()

    if (existingUser) {
        redirect('/mypage/profile?error=' + encodeURIComponent('이미 사용 중인 닉네임입니다.'))
    }

    const { error: updateErr } = await admin
        .from('cta_user')
        .update({ nickname })
        .eq('id', user.id)

    if (updateErr) {
        redirect('/mypage/profile?error=' + encodeURIComponent('닉네임 변경에 실패했습니다.'))
    }

    revalidatePath('/', 'layout')
    redirect('/mypage/profile?message=' + encodeURIComponent('프로필이 성공적으로 업데이트되었습니다.'))
}
