import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/index.css'
import ThemeProvider from './app/providers/ThemeProvider'
import LanguageProvider from './shared/i18n/LanguageProvider'
import CityProvider from './features/events/CityProvider'
import QueryProvider from './app/providers/QueryProvider'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { restoreSession } from './features/auth/auth'
import { signedIn, signedOut } from './features/auth/authSlice'
import { setSessionExpiredHandler } from './shared/api/client'


setSessionExpiredHandler(() => store.dispatch(signedOut()))

void restoreSession().then((user) => {
    if (store.getState().auth.status !== 'checking') return

    store.dispatch(user ? signedIn(user) : signedOut())
})

createRoot(document.getElementById('root')!).render(
  	<StrictMode>
		<ThemeProvider>
			<LanguageProvider>
				<QueryProvider>
					<CityProvider>
						<Provider store={store}>
							<App />
						</Provider>
					</CityProvider>
				</QueryProvider>
			</LanguageProvider>
		</ThemeProvider>	
	</StrictMode>
)