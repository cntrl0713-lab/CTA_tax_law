import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DAILY_LIMIT = 3

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

    if (!ctaUser || !['member', 'pro', 'admin'].includes(ctaUser.tier)) {
        return NextResponse.json(
            { error: 'member 이상 회원만 힌트보기를 이용할 수 있습니다.' },
            { status: 403 }
        )
    }

    // 3. 일일 횟수 제한 (KST 기준)
    const todayStart = utcTodayStartKST()
    const { count } = await admin
        .from('cta_feature_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('feature_type', 'hint')
        .gte('created_at', todayStart.toISOString())

    const usedToday = count || 0
    if (usedToday >= DAILY_LIMIT) {
        return NextResponse.json(
            { error: `오늘 힌트보기 ${DAILY_LIMIT}회를 모두 사용했습니다. 내일 다시 이용해 주세요.` },
            { status: 403 }
        )
    }

    // 4. 요청 파싱
    const body = await req.json()
    const { problemId, subquestionId } = body as { problemId: number; subquestionId: number }
    if (!problemId || !subquestionId) {
        return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    // 5. 루브릭에서 keywords_json 조회
    const { data: rubrics, error: rubricErr } = await admin
        .from('cta_subquestion_rubric')
        .select('keywords_json')
        .eq('subquestion_id', subquestionId)

    if (rubricErr || !rubrics) {
        return NextResponse.json({ error: '힌트 데이터를 찾을 수 없습니다.' }, { status: 404 })
    }

    // keywords_json 형태에 따라 키워드 배열 추출
    const keywords: string[] = rubrics.flatMap((r) => {
        const kj = r.keywords_json
        if (!kj) return []
        if (Array.isArray(kj)) return kj as string[]
        if (typeof kj === 'object') {
            return Object.values(kj as Record<string, unknown>)
                .flatMap((v) => (Array.isArray(v) ? v : [v]))
                .filter((v): v is string => typeof v === 'string')
        }
        return []
    })

    // 6. 사용 이력 기록
    await admin.from('cta_feature_log').insert({
        user_id: user.id,
        problem_id: problemId,
        subquestion_id: subquestionId,
        feature_type: 'hint',
    })

    return NextResponse.json({
        keywords,
        remainingToday: DAILY_LIMIT - usedToday - 1,
    })
}
