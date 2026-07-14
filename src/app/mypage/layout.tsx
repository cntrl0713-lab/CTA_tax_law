import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function MypageLayout({ children }: { children: React.ReactNode }) {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()

    if (!user || user.is_anonymous) redirect('/login')

    return (
        <div className="mypage-layout">
            <nav className="mypage-nav">
                <Link href="/mypage/profile" className="mypage-nav-item">🙍 프로필</Link>
                <Link href="/mypage" className="mypage-nav-item">📊 학습 통계</Link>
                <Link href="/mypage/notes" className="mypage-nav-item">📒 오답노트</Link>
                <Link href="/ranking" className="mypage-nav-item">🏆 랭킹</Link>
            </nav>
            <main className="mypage-content">{children}</main>
        </div>
    )
}
