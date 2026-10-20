/**
 * The Sahi Daam MVP (spec v2). Routes live in routes.tsx; the prototype's
 * judge pages are under /how-it-works.
 */
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import { I18nProvider } from '../i18n'
import { routes } from './routes'

const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
})

export function App() {
  return (
    <I18nProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </I18nProvider>
  )
}
