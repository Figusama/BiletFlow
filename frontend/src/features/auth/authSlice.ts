import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface AuthUser {
    fullName: string
    email: string
}

interface AuthState {
    user: AuthUser | null
    status: 'checking' | 'guest' | 'authenticated'
}

const initialState: AuthState = {
    user: null,
    status: 'checking',
}

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        signedIn: (state, action: PayloadAction<AuthUser>) => {
            state.user = action.payload
            state.status = 'authenticated'
        },
        signedOut: (state) => {
            state.user = null
            state.status = 'guest'
        },
    },
})

export const { signedIn, signedOut } = authSlice.actions
export default authSlice.reducer