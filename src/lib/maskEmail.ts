/**
 * 이메일 마스킹 (ab***@example.com)
 * 로컬 파트의 앞 두 글자만 보이고 나머지는 별표로 마스킹
 * 로컬 파트가 두 글자 이하라면 최소 첫 글자만 보이고 별표 처리.
 */
export function maskEmail(email: string | null): string {
    if (!email) return '익명사용자'

    const parts = email.split('@')
    if (parts.length !== 2) return email

    const localPart = parts[0]
    const domainPart = parts[1]

    if (localPart.length <= 2) {
        return localPart[0] + '*'.repeat(localPart.length > 1 ? 1 : 2) + '@' + domainPart
    }

    return localPart.substring(0, 2) + '*'.repeat(localPart.length - 2) + '@' + domainPart
}
