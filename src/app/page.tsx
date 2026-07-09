import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubjectWithCount } from '@/types/db'

export default async function HomePage() {
  const supabase = createAdminClient()

  // 과목 목록 + 문제 수 조회
  const { data: subjects } = await supabase
    .from('cta_subject')
    .select('*')
    .order('id')

  // 과목별 문제 수 조회
  const { data: allProblems } = await supabase
    .from('cta_problem')
    .select('subject_id')

  const countMap: Record<number, number> = {}
  allProblems?.forEach((p) => {
    countMap[p.subject_id] = (countMap[p.subject_id] || 0) + 1
  })

  const subjectsWithCount: SubjectWithCount[] = (subjects || []).map((s) => ({
    ...s,
    problem_count: countMap[s.id] || 0,
  }))

  return (
    <>
      <section className="hero">
        <h1>세무사 세법 AI 채점</h1>
        <p>
          세법 사례형 문제를 풀고, AI가 설정된 채점 기준에 따라 즉시 부분 채점합니다.
          소문항별 상세 피드백으로 실력을 키워보세요.
        </p>
      </section>

      <div className="container">
        <h2 className="section-title">📚 과목 선택</h2>
        {subjectsWithCount.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <p>등록된 과목이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-2">
            {subjectsWithCount.map((subject) => (
              <Link
                key={subject.id}
                href={`/subjects/${subject.id}`}
                className="card-link"
              >
                <div className="card subject-card">
                  <div className="subject-name">{subject.name}</div>
                  <div className="subject-count">
                    {subject.problem_count}개 문제
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
