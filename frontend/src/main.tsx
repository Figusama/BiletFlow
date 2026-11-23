import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/index.css'
import ThemeProvider from './app/providers/ThemeProvider'
import QueryProvider from './app/providers/QueryProvider'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { restoreSession } from './features/auth/auth'
import { signedIn, signedOut } from './features/auth/authSlice'


void restoreSession().then((user) => {
    if (store.getState().auth.status !== 'checking') return

    store.dispatch(user ? signedIn(user) : signedOut())
})

createRoot(document.getElementById('root')!).render(
  	<StrictMode>
		<ThemeProvider>
			<QueryProvider>
				<Provider store={store}>
					<App />
				</Provider>
			</QueryProvider>
		</ThemeProvider>	
	</StrictMode>
)