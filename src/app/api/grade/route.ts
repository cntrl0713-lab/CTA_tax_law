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
        const { data: claimsData } = await supabase.auth.getClaims()
        if (!claimsData?.claims) {
            return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
        }

        // 2. 요청 파싱 및 검증
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

        // 3. Supabase에서 문제/소문항/루브릭 조회 (관리자 클라이언트로 RLS 우회)
        const adminSupabase = createAdminClient()
        const { data: problem, error: problemError } = await adminSupabase
            .from('problems')
            .select(`
        *,
        subquestions (
          *,
          subquestion_rubrics (*)
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

        // 4. Gemini 채점 호출
        const result = await gradeProblem(
            problem as ProblemWithDetails,
            answers
        )

        // 5. 결과 반환 (DB 저장 없음 — MVP)
        return NextResponse.json(result)
    } catch (error) {
        console.error('채점 API 오류:', error)
        return NextResponse.json(
            { error: '채점 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
            { status: 500 }
        )
    }
}
