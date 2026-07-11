import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import StatsView from '@/components/StatsView'

export default async function MyPageStatsPage() {
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
    if (!['pro', 'admin'].includes(tier)) {
        return (
            <div className="mypage-blocked">
                <h2>🔒 pro 회원 전용 기능</h2>
                <p>학습 통계는 pro 이상 회원만 이용할 수 있습니다.</p>
            </div>
        )
    }

    return <StatsView />
}
