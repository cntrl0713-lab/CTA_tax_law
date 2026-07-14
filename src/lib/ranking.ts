import { createAdminClient } from '@/lib/supabase/admin'
import { unstable_cache } from 'next/cache'

export interface RankingEntry {
    user_id: string
    nickname: string | null
    email: string | null
    total_score: number
}

/**
 * 주어진 시점을 기준으로 해당 KST "월"의 시작/끝 타임스탬프(Date)를 계산.
 */
export function getKstMonthBounds(date: Date = new Date()) {
    const kstMatch = new Date(date.getTime() + 9 * 60 * 60 * 1000)
    const startOfMonth = new Date(Date.UTC(kstMatch.getUTCFullYear(), kstMatch.getUTCMonth(), 1, -9, 0, 0))
    const nextMonth = new Date(Date.UTC(kstMatch.getUTCFullYear(), kstMatch.getUTCMonth() + 1, 1, -9, 0, 0))
    return { startOfMonth, nextMonth, year: kstMatch.getUTCFullYear(), month: kstMatch.getUTCMonth() + 1 }
}

/**
 * 당월(KST 기준) 사용자별 랭킹 집계 공통 함수. (DB에서 전체 스캔)
 */
async function fetchMonthlyRankingData(limit: number): Promise<RankingEntry[]> {
    const admin = createAdminClient()
    const { startOfMonth, nextMonth } = getKstMonthBounds()

    const userProblemMax: Record<string, Record<number, number>> = {}
    const userInfoMap: Record<string, { nickname: string | null; email: string | null }> = {}

    let hasMore = true
    let page = 0
    const pageSize = 1000

    while (hasMore) {
        // totalScore:result_json->totalScore 사용 시 문자열일 수 있으므로 Number() 변환 필요
        const { data: attempts, error } = await admin
            .from('cta_grading_attempt')
            .select(`user_id, problem_id, totalScore:result_json->totalScore`)
            .eq('hint_used', false)
            .gte('created_at', startOfMonth.toISOString())
            .lt('created_at', nextMonth.toISOString())
            .order('id')
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (error || !attempts) {
            console.error('getMonthlyRanking error', error)
            return [] // 부분 집계 방지
        }

        // 수집된 user_id 
        const uids = Array.from(new Set(attempts.map(a => a.user_id)))

        // CtaUser 조회용 타입 지정
        type PickedUser = { id: string; nickname: string | null; email: string | null }
        let usersData: PickedUser[] = []
        if (uids.length > 0) {
            const { data: users } = await admin
                .from('cta_user')
                .select('id, nickname, email')
                .in('id', uids)
                .not('email', 'is', null)
            if (users) {
                usersData = users
            }
        }

        const validUserIds = new Set(usersData.map(u => u.id))

        attempts.forEach((row) => {
            if (!validUserIds.has(row.user_id)) return // guest 제외

            const uid = row.user_id
            const pid = row.problem_id
            const tScore = Number(row.totalScore || 0)

            if (!userProblemMax[uid]) userProblemMax[uid] = {}
            if (!userProblemMax[uid][pid] || userProblemMax[uid][pid] < tScore) {
                userProblemMax[uid][pid] = tScore
            }
        })

        // userInfoMap 갱신
        usersData.forEach(u => {
            if (!userInfoMap[u.id]) {
                userInfoMap[u.id] = { nickname: u.nickname, email: u.email }
            }
        })

        if (attempts.length < pageSize) {
            hasMore = false
        } else {
            page++
        }
    }

    const result: RankingEntry[] = []
    for (const [uid, probScores] of Object.entries(userProblemMax)) {
        let total = 0
        for (const score of Object.values(probScores)) {
            total += score
        }
        result.push({
            user_id: uid,
            nickname: userInfoMap[uid]?.nickname || null,
            email: userInfoMap[uid]?.email || null,
            total_score: total,
        })
    }

    // 내림차순 정렬 및 동점자일 시 user_id 사전순 보조키로 안정성 확보
    result.sort((a, b) => b.total_score - a.total_score || a.user_id.localeCompare(b.user_id))

    return result.slice(0, limit)
}

/**
 * 캐시가 적용된 랭킹 조회 (60초 주기 갱신)
 */
export const getMonthlyRanking = unstable_cache(
    async (limit: number) => fetchMonthlyRankingData(limit),
    ['monthly_ranking_stats'], // 캐시 키
    { revalidate: 60, tags: ['ranking'] } // 60초 캐싱
)
