import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/index.css'
import ThemeProvider from './app/providers/ThemeProvider'
import QueryProvider from './app/providers/QueryProvider'

createRoot(document.getElementById('root')!).render(
  	<StrictMode>
		<ThemeProvider>
			{/* Выше App, чтобы любая страница могла делать запросы через useQuery */}
			<QueryProvider>
				<App />
			</QueryProvider>
		</ThemeProvider>	
	</StrictMode>
)