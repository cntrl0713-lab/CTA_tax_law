import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import './globals.css'

export const metadata: Metadata = {
  title: '세법학 — AI 세법 채점',
  description: '세무사 시험 세법 문제를 AI가 실시간 채점합니다.',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const user = claimsData?.claims

  return (
    <html lang="ko">
      <body>
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            📝 세법학 <span>AI 채점</span>
          </Link>
          <div className="navbar-actions">
            <a
              href={process.env.NEXT_PUBLIC_KAKAOTALK_URL || 'https://open.kakao.com'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              💬 문의하기
            </a>
            {user ? (
              <>
                <Link href="/mypage" className="btn btn-ghost btn-sm">
                  마이페이지
                </Link>
                <span className="navbar-user">{(user as Record<string, unknown>).email as string}</span>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="btn btn-ghost btn-sm">
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn btn-ghost btn-sm">
                로그인
              </Link>
            )}
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
