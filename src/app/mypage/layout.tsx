import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function MypageLayout({ children }: { children: React.ReactNode }) {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()

    if (!user || user.is_anonymous) redirect('/login')

    const admin = createAdminClient()
    const { data: ctaUser } = await admin
        .from('cta_user')
        .select('tier')
        .eq('id', user.id)
        .single()

    const tier = ctaUser?.tier ?? 'member'
    const isPro = ['pro', 'admin'].includes(tier)

    return (
        <div className="mypage-layout">
            <nav className="mypage-nav">
                <Link href="/mypage" className="mypage-nav-item">📊 학습 통계</Link>
                <Link href="/mypage/notes" className="mypage-nav-item">📒 오답노트</Link>
                {!isPro && (
                    <div className="mypage-pro-badge">
                        <span>위 기능은 pro 전용입니다</span>
                    </div>
                )}
            </nav>
            <main className="mypage-content">{children}</main>
        </div>
    )
}
