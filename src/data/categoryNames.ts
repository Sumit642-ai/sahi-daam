/**
 * Category ids and names only. The seller app imports this instead of
 * ./index.ts, which also pulls in the prototype's synthetic listings and
 * journey data (heavy, and only needed under /how-it-works).
 */
import categoriesJson from './categories.json'

export interface CategoryName {
  id: string
  name_en: string
  name_hi: string
}

export const categoryNames: CategoryName[] = categoriesJson.categories.map((c) => ({
  id: c.id,
  name_en: c.name_en,
  name_hi: c.name_hi,
}))
