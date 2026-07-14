import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubjectWithCount } from '@/types/db'

interface HomePageProps {
  searchParams: Promise<{ type?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedParams = await searchParams
  const type = resolvedParams.type === 'theory' ? 'theory' : 'case'
  const isTheory = type === 'theory'

  const supabase = createAdminClient()

  // 과목 목록
  const { data: subjects } = await supabase
    .from('cta_subject')
    .select('*')
    .order('id')

  // 전체 문제 (유형별 집계를 위해 problem_type 추가 조회)
  const { data: allProblems } = await supabase
    .from('cta_problem')
    .select('subject_id, problem_type')

  const countMap: Record<number, number> = {}
  allProblems?.forEach((p) => {
    const pType = p.problem_type || 'case' // 과거 데이터 하위호환 (null == case)
    if (pType === type) {
      countMap[p.subject_id] = (countMap[p.subject_id] || 0) + 1
    }
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
          세법 사례형·이론형 문제를 풀고, AI가 설정된 채점 기준에 따라 즉시 부분 채점합니다.
          소문항별 상세 피드백으로 실력을 키워보세요.
        </p>
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <a
            href={process.env.NEXT_PUBLIC_KAKAOTALK_URL || 'https://open.kakao.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-kakaotalk btn-lg"
          >
            💬 카카오톡 오픈채팅 문의하기
          </a>
        </div>
      </section>

      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>📚 과목 선택</h2>

          <div className="type-tabs" style={{ marginBottom: 0 }}>
            <Link
              href="/"
              className={`type-tab ${!isTheory ? 'active' : ''}`}
            >
              📋 사례형
            </Link>
            <Link
              href="/?type=theory"
              className={`type-tab ${isTheory ? 'active' : ''}`}
            >
              📚 이론형
            </Link>
          </div>
        </div>

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
                href={`/subjects/${subject.id}${isTheory ? '?type=theory' : '?type=case'}`}
                className="card-link"
              >
                <div className="card subject-card">
                  <div className="subject-name">{subject.name}</div>
                  <div className="subject-count">
                    {subject.problem_count}{isTheory ? '세트 (세트당 물음 5개)' : '개 문제'}
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
