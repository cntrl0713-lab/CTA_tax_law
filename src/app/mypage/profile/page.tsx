import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { updateProfile } from './actions'

export default async function ProfilePage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>
}) {
    const params = await searchParams
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()

    if (!user || user.is_anonymous) redirect('/login')

    const admin = createAdminClient()
    const { data: ctaUser } = await admin
        .from('cta_user')
        .select('nickname')
        .eq('id', user.id)
        .single()

    return (
        <div className="mypage-section" style={{ maxWidth: '400px' }}>
            <h2 className="section-title">🙍 프로필 설정</h2>

            {params.error && (
                <div className="form-message error" style={{ marginBottom: '1rem' }}>{params.error}</div>
            )}
            {params.message && (
                <div className="form-message success" style={{ marginBottom: '1rem' }}>{params.message}</div>
            )}

            <form action={updateProfile}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label" htmlFor="nickname" style={{ display: 'block', marginBottom: '0.5rem' }}>
                        닉네임
                    </label>
                    <input
                        className="form-input"
                        id="nickname"
                        name="nickname"
                        type="text"
                        defaultValue={ctaUser?.nickname || ''}
                        placeholder="2~12자 (한글/영문/숫자, 공백 및 @ 금지)"
                        minLength={2}
                        maxLength={12}
                        pattern="^[가-힣a-zA-Z0-9]+$"
                        required
                        style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-default)', borderRadius: '4px' }}
                    />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    변경사항 저장
                </button>
            </form>
        </div>
    )
}
