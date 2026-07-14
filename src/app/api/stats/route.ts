import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StatsPeriod, SubjectStats, StatsResponse } from '@/types/stats'

function utcTodayStartKST(): Date {
    const kstOffset = 9 * 60 * 60 * 1000
    const now = new Date()
    const kstNow = new Date(now.getTime() + kstOffset)
    const kstMidnight = new Date(
        Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
    )
    return new Date(kstMidnight.getTime() - kstOffset)
}

export async function GET(req: Request) {
    // 1. 인증
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user || user.is_anonymous) {
        return NextResponse.json({ error: '회원 로그인이 필요합니다.' }, { status: 401 })
    }

    const admin = createAdminClient()

    // 3. 기간 파라미터
    const url = new URL(req.url)
    const period = (url.searchParams.get('period') || 'weekly') as StatsPeriod

    // 4. KST 기준 기간 필터 계산
    const todayStart = utcTodayStartKST()
    let cutoff: Date
    if (period === 'weekly') {
        cutoff = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'monthly') {
        cutoff = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else {
        cutoff = new Date(0) // all
    }

    // 5. 집계 쿼리 — hint_used=false인 순수 채점 결과만
    const query = admin
        .from('cta_grading_attempt')
        .select(`
            result_json,
            cta_problem!inner (
                total_score,
                subject_id,
                cta_subject!inner ( id, name )
            )
        `)
        .eq('user_id', user.id)
        .eq('hint_used', false)
        .not('result_json', 'is', null)

    if (period !== 'all') {
        query.gte('created_at', cutoff.toISOString())
    }

    const { data: attempts, error: queryErr } = await query

    if (queryErr) {
        console.error('[stats] 쿼리 오류:', queryErr)
        return NextResponse.json({ error: '통계 조회에 실패했습니다.' }, { status: 500 })
    }

    // 6. 집계 로직
    const subjectMap = new Map<number, SubjectStats>()
    let overallAwarded = 0
    let overallMax = 0
    let overallCount = 0

    for (const attempt of (attempts || [])) {
        const prob = (attempt as unknown as {
            result_json: { totalScore: number }
            cta_problem: { total_score: number; subject_id: number; cta_subject: { id: number; name: string } }
        })
        const subj = prob.cta_problem?.cta_subject
        const awarded = Number(prob.result_json?.totalScore ?? 0)
        const max = prob.cta_problem?.total_score ?? 0

        overallAwarded += awarded
        overallMax += max
        overallCount++

        if (subj) {
            const existing = subjectMap.get(subj.id)
            if (existing) {
                existing.awardedSum += awarded
                existing.maxSum += max
                existing.count++
                existing.ratio = existing.maxSum > 0 ? existing.awardedSum / existing.maxSum : 0
            } else {
                subjectMap.set(subj.id, {
                    subjectId: subj.id,
                    subjectName: subj.name,
                    awardedSum: awarded,
                    maxSum: max,
                    ratio: max > 0 ? awarded / max : 0,
                    count: 1,
                })
            }
        }
    }

    const response: StatsResponse = {
        period,
        overall: {
            subjectId: -1,
            subjectName: '전체',
            awardedSum: overallAwarded,
            maxSum: overallMax,
            ratio: overallMax > 0 ? overallAwarded / overallMax : 0,
            count: overallCount,
        },
        bySubject: Array.from(subjectMap.values()),
    }

    return NextResponse.json(response)
}
