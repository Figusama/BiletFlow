import { useSelector } from 'react-redux'
import { Navigate, Outlet } from 'react-router-dom'
import type { RootState } from '../../app/store'

const RequireAdmin = () => {
    const user = useSelector((state: RootState) => state.auth.user)

    if (user?.role !== 'PLATFORM_ADMIN') return <Navigate to="/" replace />

    return <Outlet />
}

export default RequireAdmin
