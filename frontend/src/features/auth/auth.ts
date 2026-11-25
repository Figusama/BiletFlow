import type { AuthUser } from './authSlice'
import { api, ApiError, refreshAccessToken, setAccessToken } from '../../shared/api/client'

export type SignInInput = {
    email: string
    password: string
}

type SignInResult =
    | { status: 'success'; user: AuthUser }
    | { status: 'invalid_credentials' }
    | { status: 'email_verification_required' }

export const signIn = async (input: SignInInput): Promise<SignInResult> => {
    let token: string

    try {
        const result = await api<{ access_token: string }>('/auth/token', {
            method: 'POST',
            form: new URLSearchParams({
                username: input.email.trim(),
                password: input.password,
            }),
        })

        token = result.access_token
    } catch (error) {
        if (error instanceof ApiError) {
            if (error.status === 401) {
                return { status: 'invalid_credentials' }
            }

            if (error.status === 403 && error.message === 'Email is not verified') {
                return { status: 'email_verification_required' }
            }
        }

        throw error
    }

    setAccessToken(token)

    return { status: 'success', user: await loadCurrentUser() }
}

const loadCurrentUser = async (): Promise<AuthUser> => {
    const profile = await api<{ id: string; public_id: string; personal_role: AuthUser['role']; full_name: string; email: string }>('/auth/users/me/')

    return {
        id: profile.id,
        publicId: profile.public_id,
        role: profile.personal_role,
        fullName: profile.full_name,
        email: profile.email,
    }
}

export const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
}




export type RegisterAccountInput = {
    fullName: string
    email: string
    phone: string
    password: string
}

export const registerAccount = async (
    input: RegisterAccountInput,
): Promise<{ email: string }> => {
    await api<{ detail: string }>('/auth/register', {
        method: 'POST',
        json: {
            full_name: input.fullName,
            email: input.email,
            phone: input.phone,
            password: input.password,
        },
    })

    return { email: input.email }
}




export const verifyEmail = async (token: string) => {
    const query = new URLSearchParams({ token })
    await api(`/auth/verify-email?${query}`)
}





export const requestPasswordReset = async (email: string): Promise<void> => {
    await api('/auth/forgot-password', {
        method: 'POST',
        json: { email },
    })
}




export const resetPassword = async (input: {
    token: string
    newPassword: string
}): Promise<'success' | 'invalid_token'> => {
    try {
        await api('/auth/reset-password', {
            method: 'POST',
            json: {
                token: input.token,
                new_password: input.newPassword,
            },
        })

        return 'success'
    } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
            return 'invalid_token'
        }

        throw error
    }
}




export const restoreSession = async (): Promise<AuthUser | null> => {
    const refreshed = await refreshAccessToken()
    if (!refreshed) return null

    try {
        return await loadCurrentUser()
    } catch {
        setAccessToken(null)
        return null
    }
}
