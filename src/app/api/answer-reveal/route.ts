import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AnswerRevealResponse } from '@/types/hint'

const DAILY_LIMIT = 99999

/** KST 기준 오늘 자정(UTC) 반환 */
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

    // if (!ctaUser || !['member', 'pro', 'admin'].includes(ctaUser.tier)) {
    //     return NextResponse.json(
    //         { error: 'member 이상 회원만 정답보기를 이용할 수 있습니다.' },
    //         { status: 403 }
    //     )
    // }

    // 3. 요청 파싱 (문제 단위)
    const body = await req.json()
    const { problemId } = body as { problemId: number }
    if (!problemId) {
        return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    // 4. 학습보조 상태 조회 (선행조건 + 재열람 판정)
    const todayStart = utcTodayStartKST()
    const { data: existing } = await admin
        .from('cta_problem_assist')
        .select('id, hint_used_at, answer_used_at')
        .eq('user_id', user.id)
        .eq('problem_id', problemId)
        .maybeSingle()

    // 5. 선행조건: 해당 문제에서 힌트를 먼저 사용했는지 서버에서 검증
    if (!existing?.hint_used_at) {
        return NextResponse.json(
            { error: '해당 문제의 힌트를 먼저 확인해야 정답을 볼 수 있습니다.' },
            { status: 403 }
        )
    }

    const alreadyRevealedToday =
        !!existing.answer_used_at && new Date(existing.answer_used_at) >= todayStart

    // 6. 오늘 정답을 사용한 서로 다른 문제 수 집계
    const { count: usedProblemsToday } = await admin
        .from('cta_problem_assist')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('answer_used_at', todayStart.toISOString())

    if (!alreadyRevealedToday && (usedProblemsToday || 0) >= DAILY_LIMIT) {
        return NextResponse.json(
            { error: `오늘 정답보기 ${DAILY_LIMIT}개 문제를 모두 사용했습니다. 내일 다시 이용해 주세요.` },
            { status: 403 }
        )
    }

    // 7. 문제의 모든 물음 + 루브릭(모범답안) 조회
    const { data: subquestions, error: sqErr } = await admin
        .from('cta_subquestion')
        .select('number, cta_subquestion_rubric ( criterion_name, example_answer_text, display_order )')
        .eq('problem_id', problemId)
        .order('number')

    if (sqErr || !subquestions) {
        return NextResponse.json({ error: '정답 데이터를 찾을 수 없습니다.' }, { status: 404 })
    }

    const grouped = (subquestions as {
        number: number
        cta_subquestion_rubric: {
            criterion_name: string
            example_answer_text: string | null
            display_order: number
        }[]
    }[]).map((sq) => ({
        number: sq.number,
        rubrics: [...(sq.cta_subquestion_rubric || [])]
            .sort((a, b) => a.display_order - b.display_order)
            .map((r) => ({
                criterionName: r.criterion_name,
                exampleAnswerText: r.example_answer_text,
            })),
    }))

    // 8. 정답 열람 시각 기록 (선행조건상 행이 이미 존재하므로 update)
    await admin
        .from('cta_problem_assist')
        .update({ answer_used_at: new Date().toISOString() })
        .eq('id', existing.id)

    // 9. 남은 횟수: 신규 소비면 +1 반영, 재열람이면 현재값 유지
    const consumed = alreadyRevealedToday
        ? (usedProblemsToday || 0)
        : (usedProblemsToday || 0) + 1

    const response: AnswerRevealResponse = {
        subquestions: grouped,
        remainingToday: Math.max(0, DAILY_LIMIT - consumed),
    }
    return NextResponse.json(response)
}
