'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signup(formData: FormData) {
    const supabase = await createClient()

    let email = formData.get('email') as string
    if (email && !email.includes('@')) {
        email = `${email}@cpa.com`
    }

    const data = {
        email,
        password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signUp(data)

    if (error) {
        redirect('/signup?error=' + encodeURIComponent(error.message))
    }

    revalidatePath('/', 'layout')
    redirect('/signup?message=' + encodeURIComponent('확인 이메일을 확인해 주세요.'))
}
