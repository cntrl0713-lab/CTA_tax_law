'use client'

import { useState } from 'react'

interface SaveNoteButtonProps {
    attemptId: string
    initialSaved: boolean
    userTier: 'guest' | 'member' | 'pro' | 'admin'
}

export default function SaveNoteButton({ attemptId, initialSaved, userTier }: SaveNoteButtonProps) {
    const [saved, setSaved] = useState(initialSaved)
    const [loading, setLoading] = useState(false)

    const canSave = ['pro', 'admin'].includes(userTier)

    if (!canSave) {
        return (
            <div className="save-note-locked">
                <span>📒 오답노트 저장은 pro 회원 전용입니다.</span>
            </div>
        )
    }

    const handleToggle = async () => {
        setLoading(true)
        try {
            if (!saved) {
                const res = await fetch('/api/note/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ attemptId }),
                })
                if (!res.ok) {
                    const data = await res.json()
                    throw new Error(data.error)
                }
                setSaved(true)
            } else {
                const res = await fetch('/api/note/save', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ attemptId }),
                })
                if (!res.ok) {
                    const data = await res.json()
                    throw new Error(data.error)
                }
                setSaved(false)
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : '처리에 실패했습니다.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            className={`btn btn-save-note ${saved ? 'saved' : ''}`}
            onClick={handleToggle}
            disabled={loading}
        >
            {loading ? '처리 중...' : saved ? '📒 오답노트 저장됨' : '📒 오답노트에 저장'}
        </button>
    )
}
