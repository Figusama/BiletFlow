import type { AuthUser } from './authSlice'

export type SignInInput = {
    email: string
    password: string
}

type SignInResult =
    | { status: 'success'; user: AuthUser }
    | { status: 'invalid_credentials' }
    | { status: 'email_verification_required' }

export async function signIn(input: SignInInput): Promise<SignInResult> {
    
    const email = input.email.trim().toLowerCase()

    if (input.password === 'DemoPass123') {
        if (email === 'demo@example.kz') {
            return {
                status: 'success',
                user: {
                    fullName: 'Demo User',
                    email,
                },
            }
        }

        if (email === 'pending@example.kz') {
            return { status: 'email_verification_required' }
        }
    }

    return { status: 'invalid_credentials' }
}




export type RegisterAccountInput = {
    fullName: string
    email: string
    phone: string
    password: string
}

export const registerAccount = async (input: RegisterAccountInput): Promise<{ email: string }> => {

    return { email: input.email }
}




export const verifyEmail = (token: string) => token === 'demo'





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
