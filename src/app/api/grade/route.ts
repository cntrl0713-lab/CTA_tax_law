import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gradeProblem } from '@/lib/gemini/gradeProblem'
import type { GradeRequest } from '@/types/grading'
import type { ProblemWithDetails } from '@/types/db'

export async function POST(request: Request) {
    try {
        // 1. 인증 확인
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
        }

        const adminSupabase = createAdminClient()

        // 2. 등급 파악 (Guest, member, pro, admin)
        let userTier: 'guest' | 'member' | 'pro' | 'admin' = 'guest'
        if (user.is_anonymous) {
            userTier = 'guest'
        } else {
            const { data: ctaUser } = await adminSupabase
                .from('cta_user')
                .select('tier')
                .eq('id', user.id)
                .single()
            userTier = (ctaUser?.tier as 'member' | 'pro' | 'admin') || 'member'
        }

        // 3. 오늘 자정(KST 기준) 이후 채점 횟수 집계
        const now = new Date()
        const kstOffset = 9 * 60 * 60 * 1000 // 9시간
        const kstNow = new Date(now.getTime() + kstOffset)
        const kstTodayStart = new Date(
            Date.UTC(
                kstNow.getUTCFullYear(),
                kstNow.getUTCMonth(),
                kstNow.getUTCDate(),
                0, 0, 0, 0
            )
        )
        const utcTodayStart = new Date(kstTodayStart.getTime() - kstOffset)

        const { count, error: countError } = await adminSupabase
            .from('cta_grading_attempt')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', utcTodayStart.toISOString())

        if (countError) {
            console.error('채점 횟수 확인 실패:', countError)
            return NextResponse.json(
                { error: '채점 횟수를 조회하는 데 실패했습니다.' },
                { status: 500 }
            )
        }

        const attemptsCount = count || 0

        // 4. 등급별 채점 제한 검사
        if (userTier === 'guest' && attemptsCount >= 1) {
            return NextResponse.json(
                { error: '비회원은 하루에 한 번만 채점이 가능합니다.' },
                { status: 403 }
            )
        } else if (userTier === 'member' && attemptsCount >= 3) {
            return NextResponse.json(
                { error: '무료회원은 하루에 세 번만 채점이 가능합니다.' },
                { status: 403 }
            )
        }

        // 5. 요청 파싱 및 검증
        const body: GradeRequest = await request.json()
        const { problemId, answers } = body

        if (!problemId || !answers || !Array.isArray(answers)) {
            return NextResponse.json(
                { error: '유효하지 않은 요청입니다. problemId와 answers가 필요합니다.' },
                { status: 400 }
            )
        }

        // 답안 길이 검증 (비용 통제)
        for (const answer of answers) {
            if (answer.answerText && answer.answerText.length > 5000) {
                return NextResponse.json(
                    { error: '답안의 최대 길이는 5000자입니다.' },
                    { status: 400 }
                )
            }
        }

        // 6. Supabase에서 문제/소문항/루브릭 조회 (관리자 클라이언트로 RLS 우회)
        const { data: problem, error: problemError } = await adminSupabase
            .from('cta_problem')
            .select(`
        *,
        cta_subquestion (
          *,
          cta_subquestion_rubric (*)
        )
      `)
            .eq('id', problemId)
            .single()

        if (problemError || !problem) {
            return NextResponse.json(
                { error: '문제를 찾을 수 없습니다.' },
                { status: 404 }
            )
        }

        // 7-1. 힌트/정답 사용 이력 확인 (채점 통계 제외 여부를 결정)
        const { count: featureCount } = await adminSupabase
            .from('cta_feature_log')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('problem_id', problemId)
        const hintUsedFlag = (featureCount ?? 0) > 0

        // 7-2. Gemini 채점 호출
        const result = await gradeProblem(
            problem as ProblemWithDetails,
            answers
        )

        // 8. 채점 성공 시 로그 기록 (hint_used 포함)
        const { data: attemptData, error: logError } = await adminSupabase
            .from('cta_grading_attempt')
            .insert({
                user_id: user.id,
                problem_id: problemId,
                answers_json: answers,
                result_json: result,
                hint_used: hintUsedFlag,
            })
            .select('id')
            .single()

        if (logError) {
            console.error('채점 로그 기록 실패:', logError)
        }

        const attemptId = attemptData?.id || null

        // 9. 결과 반환
        return NextResponse.json({
            attemptId,
            ...result
        })
    } catch (error) {
        console.error('채점 API 오류:', error)
        return NextResponse.json(
            { error: '채점 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
            { status: 500 }
        )
    }
}
