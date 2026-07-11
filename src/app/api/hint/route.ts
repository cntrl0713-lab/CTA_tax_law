import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { HintResponse } from '@/types/hint'

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

/** keywords_json(문자열/배열/객체 혼재)에서 문자열 키워드만 추출 */
function extractKeywords(keywordsJson: unknown): string[] {
    let kj: unknown = keywordsJson
    if (!kj) return []
    if (typeof kj === 'string') {
        try {
            kj = JSON.parse(kj)
        } catch {
            return []
        }
    }
    if (Array.isArray(kj)) {
        return kj.filter((v): v is string => typeof v === 'string')
    }
    if (typeof kj === 'object' && kj !== null) {
        return Object.values(kj as Record<string, unknown>)
            .flatMap((v) => (Array.isArray(v) ? v : [v]))
            .filter((v): v is string => typeof v === 'string')
    }
    return []
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
    //         { error: 'member 이상 회원만 힌트보기를 이용할 수 있습니다.' },
    //         { status: 403 }
    //     )
    // }

    // 3. 요청 파싱 (문제 단위)
    const body = await req.json()
    const { problemId } = body as { problemId: number }
    if (!problemId) {
        return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    // 4. 현재 문제의 학습보조 상태 조회 (재열람 판정용)
    const todayStart = utcTodayStartKST()
    const { data: existing } = await admin
        .from('cta_problem_assist')
        .select('id, hint_used_at')
        .eq('user_id', user.id)
        .eq('problem_id', problemId)
        .maybeSingle()

    const alreadyHintedToday =
        !!existing?.hint_used_at && new Date(existing.hint_used_at) >= todayStart

    // 5. 오늘 힌트를 사용한 서로 다른 문제 수 집계
    const { count: usedProblemsToday } = await admin
        .from('cta_problem_assist')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('hint_used_at', todayStart.toISOString())

    // 재열람이 아닌 신규 문제인데 이미 3개를 채웠으면 차단
    if (!alreadyHintedToday && (usedProblemsToday || 0) >= DAILY_LIMIT) {
        return NextResponse.json(
            { error: `오늘 힌트보기 ${DAILY_LIMIT}개 문제를 모두 사용했습니다. 내일 다시 이용해 주세요.` },
            { status: 403 }
        )
    }

    // 6. 문제의 모든 물음 + 루브릭 키워드 조회 (물음 번호 오름차순)
    const { data: subquestions, error: sqErr } = await admin
        .from('cta_subquestion')
        .select('number, cta_subquestion_rubric ( keywords_json )')
        .eq('problem_id', problemId)
        .order('number')

    if (sqErr || !subquestions) {
        return NextResponse.json({ error: '힌트 데이터를 찾을 수 없습니다.' }, { status: 404 })
    }

    const grouped = (subquestions as {
        number: number
        cta_subquestion_rubric: { keywords_json: unknown }[]
    }[]).map((sq) => ({
        number: sq.number,
        keywords: (sq.cta_subquestion_rubric || []).flatMap((r) => extractKeywords(r.keywords_json)),
    }))

    // 7. 학습보조 상태 기록 (문제당 1행 — 힌트 열람 시각 갱신)
    const nowIso = new Date().toISOString()
    if (existing) {
        await admin
            .from('cta_problem_assist')
            .update({ hint_used_at: nowIso })
            .eq('id', existing.id)
    } else {
        await admin
            .from('cta_problem_assist')
            .insert({ user_id: user.id, problem_id: problemId, hint_used_at: nowIso })
    }

    // 8. 남은 횟수: 신규 소비면 +1 반영, 재열람이면 현재값 유지
    const consumed = alreadyHintedToday
        ? (usedProblemsToday || 0)
        : (usedProblemsToday || 0) + 1

    const response: HintResponse = {
        subquestions: grouped,
        remainingToday: Math.max(0, DAILY_LIMIT - consumed),
    }
    return NextResponse.json(response)
}
