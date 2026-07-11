import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DAILY_LIMIT = 3

function utcTodayStartKST(): Date {
    const kstOffset = 9 * 60 * 60 * 1000
    const now = new Date()
    const kstNow = new Date(now.getTime() + kstOffset)
    const kstMidnight = new Date(
        Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
    )
    return new Date(kstMidnight.getTime() - kstOffset)
}

export async function POST(req: Request) {
    // 1. 인증
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    // 2. 권한 확인 (member 이상)
    const admin = createAdminClient()
    const { data: ctaUser } = await admin
        .from('cta_user')
        .select('tier')
        .eq('id', user.id)
        .single()

    if (!ctaUser || !['member', 'pro', 'admin'].includes(ctaUser.tier)) {
        return NextResponse.json(
            { error: 'member 이상 회원만 정답보기를 이용할 수 있습니다.' },
            { status: 403 }
        )
    }

    // 3. 일일 횟수 제한
    const todayStart = utcTodayStartKST()
    const { count } = await admin
        .from('cta_feature_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('feature_type', 'answer')
        .gte('created_at', todayStart.toISOString())

    const usedToday = count || 0
    if (usedToday >= DAILY_LIMIT) {
        return NextResponse.json(
            { error: `오늘 정답보기 ${DAILY_LIMIT}회를 모두 사용했습니다. 내일 다시 이용해 주세요.` },
            { status: 403 }
        )
    }

    // 4. 요청 파싱
    const body = await req.json()
    const { problemId, subquestionId } = body as { problemId: number; subquestionId: number }
    if (!problemId || !subquestionId) {
        return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    // 5. 선행 조건: 해당 문제/물음에서 힌트를 먼저 사용했는지 서버에서 검증
    const { count: hintCount } = await admin
        .from('cta_feature_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('problem_id', problemId)
        .eq('subquestion_id', subquestionId)
        .eq('feature_type', 'hint')

    if (!hintCount || hintCount === 0) {
        return NextResponse.json(
            { error: '해당 물음의 힌트를 먼저 확인해야 정답을 볼 수 있습니다.' },
            { status: 403 }
        )
    }

    // 6. 루브릭에서 example_answer_text 조회
    const { data: rubrics, error: rubricErr } = await admin
        .from('cta_subquestion_rubric')
        .select('criterion_name, example_answer_text')
        .eq('subquestion_id', subquestionId)
        .order('display_order')

    if (rubricErr) {
        return NextResponse.json({ error: '정답 데이터를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 7. 사용 이력 기록
    await admin.from('cta_feature_log').insert({
        user_id: user.id,
        problem_id: problemId,
        subquestion_id: subquestionId,
        feature_type: 'answer',
    })

    return NextResponse.json({
        rubrics: (rubrics || []).map((r) => ({
            criterionName: r.criterion_name,
            exampleAnswerText: r.example_answer_text,
        })),
        remainingToday: DAILY_LIMIT - usedToday - 1,
    })
}
