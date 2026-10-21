/**
 * Category ids and names only. The seller app imports this instead of
 * ./index.ts, which also pulls in the prototype's synthetic listings and
 * journey data (heavy, and only needed under /how-it-works).
 *
 * The app adds "Other" for anything outside the eight: rough numbers in
 * rates.json, marked "please check", and the seller picks the GST rate.
 */
import categoriesJson from './categories.json'

export interface CategoryName {
  id: string
  name_en: string
  name_hi: string
}

export const OTHER_CATEGORY = 'other'

export const categoryNames: CategoryName[] = [
  ...categoriesJson.categories.map((c) => ({
    id: c.id,
    name_en: c.name_en,
    name_hi: c.name_hi,
  })),
  { id: OTHER_CATEGORY, name_en: 'Other', name_hi: 'अन्य' },
]
