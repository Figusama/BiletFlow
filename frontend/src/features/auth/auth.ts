import type { AuthUser } from './authSlice'
import { api, ApiError, setAccessToken } from '../../shared/api/client'

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

    const profile = await api<{ full_name: string; email: string }>('/auth/users/me/', {
        headers: { Authorization: `Bearer ${token}` },
    })

    setAccessToken(token)

    return {
        status: 'success',
        user: {
            fullName: profile.full_name,
            email: profile.email,
        },
    }
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





export const requestPasswordReset = async (_email: string): Promise<void> => {
    // TODO(API): Send a password reset request.
    await Promise.resolve()
}




export const resetPassword = async (input: {
    token: string
    newPassword: string
}): Promise<'success' | 'invalid_token'> => {
    // TODO(API): Send the token and new password to the backend.
    return input.token === 'demo' ? 'success' : 'invalid_token'
}




export const restoreSession = async (): Promise<AuthUser | null> => {
    // TODO(API): Restore the session and load the current user.
    
    return null
}
