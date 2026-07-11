import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
    // 1. 인증
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    // 2. pro 이상 권한 확인
    const admin = createAdminClient()
    const { data: ctaUser } = await admin
        .from('cta_user')
        .select('tier')
        .eq('id', user.id)
        .single()

    if (!ctaUser || !['pro', 'admin'].includes(ctaUser.tier)) {
        return NextResponse.json(
            { error: 'pro 이상 회원만 오답노트를 저장할 수 있습니다.' },
            { status: 403 }
        )
    }

    // 3. 요청 파싱
    const body = await req.json()
    const { attemptId } = body as { attemptId: string }
    if (!attemptId) {
        return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    // 4. 소유권 확인 + 업데이트
    const { data, error: updateErr } = await admin
        .from('cta_grading_attempt')
        .update({ is_saved_note: true, note_saved_at: new Date().toISOString() })
        .eq('id', attemptId)
        .eq('user_id', user.id)
        .select('note_saved_at')
        .single()

    if (updateErr || !data) {
        return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, savedAt: data.note_saved_at })
}

export async function DELETE(req: Request) {
    // 오답노트 해제
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: ctaUser } = await admin
        .from('cta_user')
        .select('tier')
        .eq('id', user.id)
        .single()

    if (!ctaUser || !['pro', 'admin'].includes(ctaUser.tier)) {
        return NextResponse.json({ error: 'pro 이상 회원만 이용할 수 있습니다.' }, { status: 403 })
    }

    const body = await req.json()
    const { attemptId } = body as { attemptId: string }

    const { error: updateErr } = await admin
        .from('cta_grading_attempt')
        .update({ is_saved_note: false, note_saved_at: null })
        .eq('id', attemptId)
        .eq('user_id', user.id)

    if (updateErr) {
        return NextResponse.json({ error: '해제에 실패했습니다.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
}
