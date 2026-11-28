import { useSelector } from 'react-redux'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { RootState } from '../../app/store'

const RequireAuth = () => {
    const status = useSelector((state: RootState) => state.auth.status)
    const location = useLocation()

    if (status === 'checking') {
        return <p role="status" className="p-6 text-muted">Checking session…</p>
    }

    if (status === 'guest') {
        return <Navigate to="/auth/token" replace state={{ from: `${location.pathname}${location.search}` }} />
    }

    return <Outlet />
}

export default RequireAuth