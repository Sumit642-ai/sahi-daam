/**
 * Real routes (spec v2, section 14): browser back behaves exactly like in-app
 * back (8.2). Exported as data so tests can mount the same tree in memory.
 *
 * The first screens a new seller sees (landing, onboarding, home, products)
 * load with the app. Everything else loads on first visit, and the service
 * worker precaches it all, so it still works offline. The prototype's judge
 * pages load lazily under /how-it-works, with Recharts.
 */
import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'

import { AppLayout, MinimalLayout, RequireOnboarded, Root } from './layout'
import { Home } from './screens/Home'
import { Landing } from './screens/Landing'
import { OnbChoose, OnbLanguage, OnbShop } from './screens/Onboarding'
import { NotFound, RouteError } from './screens/Other'
import { ProductsIndex, ProductsLayout } from './screens/Products'

/** A route whose screen is a named export of a lazily loaded module. */
function screen<M>(load: () => Promise<M>, pick: (m: M) => ComponentType): () => Promise<{ Component: ComponentType }> {
  return async () => ({ Component: pick(await load()) })
}

const upload = () => import('./screens/Upload')
const pricing = () => import('./screens/Pricing')
const productForm = () => import('./screens/ProductForm')

export const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <MinimalLayout />,
        children: [
          { index: true, element: <Landing /> },
          { path: 'start/language', element: <OnbLanguage /> },
          { path: 'start/shop', element: <OnbShop /> },
          { path: 'start/choose', element: <OnbChoose /> },
          { path: 'privacy', lazy: screen(() => import('./screens/Other'), (m) => m.Privacy) },
          { path: 'concept', lazy: screen(() => import('./screens/Concept'), (m) => m.Concept) },
          { path: 'stats', lazy: screen(() => import('./screens/Stats'), (m) => m.Stats) },
        ],
      },
      {
        element: (
          <RequireOnboarded>
            <AppLayout />
          </RequireOnboarded>
        ),
        children: [
          { path: 'home', element: <Home /> },
          {
            path: 'products',
            element: <ProductsLayout />,
            children: [
              { index: true, element: <ProductsIndex /> },
              { path: ':id', lazy: screen(() => import('./screens/ProductDetail'), (m) => m.ProductDetail) },
              { path: ':id/price', lazy: screen(pricing, (m) => m.PriceHelper) },
              { path: ':id/sale', lazy: screen(pricing, (m) => m.SaleCheck) },
            ],
          },
          { path: 'products/new', lazy: screen(productForm, (m) => m.ProductForm), handle: { hideNav: true } },
          { path: 'products/:id/edit', lazy: screen(productForm, (m) => m.ProductForm), handle: { hideNav: true } },
          { path: 'checks', lazy: screen(() => import('./screens/Checks'), (m) => m.Checks) },
          { path: 'me', lazy: screen(() => import('./screens/Me'), (m) => m.Me) },
          {
            path: 'upload',
            lazy: screen(upload, (m) => m.UploadLayout),
            children: [
              { index: true, lazy: screen(upload, (m) => m.UploadStart) },
              { path: 'map', lazy: screen(upload, (m) => m.MapColumns), handle: { hideNav: true } },
              { path: 'done/:reportId', lazy: screen(upload, (m) => m.UploadDone) },
            ],
          },
        ],
      },
      { path: 'how-it-works/:screen?', lazy: () => import('../story/StoryRoute') },
      { path: '*', element: <NotFound /> },
    ],
  },
]
