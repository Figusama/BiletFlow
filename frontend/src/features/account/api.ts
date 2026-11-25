import { api } from '../../shared/api/client'

export interface ProfileChanges {
    fullName: string
    phone: string | null
}

export const updateProfile = (changes: ProfileChanges) =>
    api<{ full_name: string }>('/users/me', {
        method: 'PATCH',
        json: changes.phone ? { full_name: changes.fullName, phone: changes.phone } : { full_name: changes.fullName },
    })

export const changePassword = (currentPassword: string, newPassword: string) =>
    api<void>('/users/me/password', { method: 'POST', json: { current_password: currentPassword, new_password: newPassword } })
