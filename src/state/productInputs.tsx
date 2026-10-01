import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import {
  type Category,
  categorySource,
  getCategory,
  isAssumption,
} from '../data'
import { type Band, bandFor } from '../engine/band'
import {
  type FloorInput,
  type FloorRange,
  type FloorResult,
  type ResolvedSlab,
  type ReturnRateTriple,
  defaultFloorInput,
  floor,
  floorRange,
  slabFor,
} from '../engine/floor'
import { BASELINE_MONTH, type MonthKey, type SeasonMonth, listSeasonMonths, seasonIndex } from '../engine/season'
import type { Provider } from '../components/SourceTag'
import { type PlatformDefaults, type SellerProfile, codShareFor } from '../auth'

/**
 * One product, shared by every screen.
 *
 * Spec section 9.3 says Screen 2's inputs are "carried from Screen 1", so the
 * product cannot live inside either screen. Everything derived from it — the
 * floor range, the competitor band, the shipping slab — is memoised here too,
 * so the two screens cannot drift into showing different numbers for the same
 * product.
 */

export interface ProductInputs {
  categoryId: string
  cogs: number | null
  weightG: number | null
  /**
   * The seller's planned price. Screen 1 types it; Screen 2's slider drags it.
   * `null` means "not decided yet", which both screens render differently from
   * a price of zero.
   */
  plannedPrice: number | null
  adSpendPerOrder: number | null
  month: MonthKey
  codShare: number
  rtoCod: number
  rtoPrepaid: number
  returnRateLow: number
  returnRateExpected: number
  returnRateHigh: number
  writeOffShare: number
  packagingCost: number | null
}

/** The deck's worked example, fixed, so the comparison always says ₹318. */
export const DECK_RESULT: FloorResult = floor({
  ...defaultFloorInput('ethnic_women', { cogs: 150, weightG: 350 }),
  seasonIndex: 1,
  unitOverrides: { rtoUnits: 17, returnUnits: 13, writeOffUnits: 6, cleanSales: 70 },
})

/**
 * Everything Meesho would auto-fill for a category, plus the seller's own
 * starting point. Used on first render and whenever the category changes.
 */
export function inputsForCategory(
  categoryId: string,
  carryOver: Partial<ProductInputs> = {},
): ProductInputs {
  const base = defaultFloorInput(categoryId)
  const category = getCategory(categoryId)
  return {
    categoryId,
    cogs: base.cogs,
    weightG: base.weightG,
    plannedPrice: null,
    adSpendPerOrder: 0,
    // Overwritten by the signed-in seller's answers, when there are any.
    // Not the current month: the baseline month, so the screen opens on the
    // seller's own un-seasoned RTO. See DECISIONS.md, decision 17.
    month: BASELINE_MONTH,
    codShare: base.codShare,
    rtoCod: base.rtoCod,
    rtoPrepaid: base.rtoPrepaid,
    returnRateLow: category.returnRateLow,
    returnRateExpected: category.returnRateExpected,
    returnRateHigh: category.returnRateHigh,
    writeOffShare: category.writeOffShare,
    packagingCost: category.packagingCost,
    ...carryOver,
  }
}

interface ProductInputsValue {
  inputs: ProductInputs
  set: <K extends keyof ProductInputs>(key: K, value: ProductInputs[K]) => void
  update: (patch: Partial<ProductInputs>) => void
  /** Switches category and re-fills everything that category decides. */
  changeCategory: (categoryId: string) => void
  /** Back to Meesho's defaults for the current category. */
  resetToDefaults: () => void

  // ----- derived, memoised, shared by every screen -----
  category: Category
  months: SeasonMonth[]
  monthRow: SeasonMonth
  season: number
  floorInput: FloorInput
  returnRates: ReturnRateTriple
  range: FloorRange
  band: Band
  slab: ResolvedSlab
  /** Non-null only while the inputs still are the deck's own kurti. */
  deck: FloorResult | null
  /** Tag a field by what its value's source actually says. */
  tagFor: (source: string) => Provider
  sources: { returnRate: string; writeOff: string; packaging: string }
}

const Context = createContext<ProductInputsValue | null>(null)

/**
 * The seller's signup answers, turned into the fields Screen 1 tags
 * "Meesho ne bhara". This is the whole point of asking them: those values stop
 * being a category default someone picked and become this seller's own.
 */
export function inputsForProfile(
  profile: SellerProfile,
  platform: PlatformDefaults,
): ProductInputs {
  return inputsForCategory(profile.categoryId, {
    cogs: profile.typicalCogs,
    weightG: profile.typicalWeightG,
    codShare: codShareFor(profile),
    rtoCod: platform.rtoCod,
    rtoPrepaid: platform.rtoPrepaid,
  })
}

interface ProviderProps {
  children: ReactNode
  /** Starting overrides. Only the edge-case tests use this. */
  initial?: Partial<ProductInputs>
  /** The signed-in seller's answers, which win over the category defaults. */
  profile?: SellerProfile | null
  /** Platform-wide fees the admin has set. */
  platform?: PlatformDefaults
}

export function ProductInputsProvider({ children, initial, profile, platform }: ProviderProps) {
  const [inputs, setInputs] = useState<ProductInputs>(() => {
    const base =
      profile && profile.completed && platform
        ? inputsForProfile(profile, platform)
        : inputsForCategory(initial?.categoryId ?? 'ethnic_women')
    return { ...base, ...initial }
  })

  const value = useMemo<ProductInputsValue>(() => {
    const set = <K extends keyof ProductInputs>(key: K, v: ProductInputs[K]) =>
      setInputs((d) => ({ ...d, [key]: v }))
    const update = (patch: Partial<ProductInputs>) => setInputs((d) => ({ ...d, ...patch }))

    const changeCategory = (categoryId: string) =>
      setInputs((d) =>
        inputsForCategory(categoryId, {
          // The price, the month, the COD mix and ad spend are the seller's own
          // context, not the category's, so they survive a category change.
          plannedPrice: d.plannedPrice,
          month: d.month,
          codShare: d.codShare,
          adSpendPerOrder: d.adSpendPerOrder,
        }),
      )

    const resetToDefaults = () =>
      setInputs((d) =>
        inputsForCategory(d.categoryId, {
          plannedPrice: d.plannedPrice,
          cogs: d.cogs,
          weightG: d.weightG,
          month: d.month,
        }),
      )

    const category = getCategory(inputs.categoryId)
    const months = listSeasonMonths()
    const monthRow = months.find((m) => m.key === inputs.month)!
    const season = seasonIndex(inputs.month)

    const floorInput: FloorInput = {
      cogs: inputs.cogs ?? 0,
      weightG: inputs.weightG ?? 0,
      categoryId: inputs.categoryId,
      codShare: inputs.codShare,
      rtoCod: inputs.rtoCod,
      rtoPrepaid: inputs.rtoPrepaid,
      returnRate: inputs.returnRateExpected,
      writeOffShare: inputs.writeOffShare,
      packagingCost: inputs.packagingCost ?? 0,
      adSpendPerOrder: inputs.adSpendPerOrder ?? 0,
      seasonIndex: season,
      // The admin's platform-wide fees, when an admin has set them.
      ...(platform ? { fees: { codFee: platform.codFee, gstRate: platform.gstRate } } : {}),
    }

    const returnRates: ReturnRateTriple = {
      low: inputs.returnRateLow,
      expected: inputs.returnRateExpected,
      high: inputs.returnRateHigh,
    }

    const deckApplies =
      inputs.categoryId === 'ethnic_women' &&
      inputs.cogs === 150 &&
      (inputs.weightG ?? 0) <= 500 &&
      inputs.codShare === 0.8 &&
      inputs.rtoCod === 0.2 &&
      inputs.rtoPrepaid === 0.05 &&
      inputs.writeOffShare === 0.46 &&
      inputs.packagingCost === 8 &&
      (inputs.adSpendPerOrder ?? 0) === 0 &&
      season === 1

    return {
      inputs,
      set,
      update,
      changeCategory,
      resetToDefaults,
      category,
      months,
      monthRow,
      season,
      floorInput,
      returnRates,
      range: floorRange(floorInput, returnRates),
      band: bandFor(inputs.categoryId),
      slab: slabFor(inputs.weightG ?? 0),
      deck: deckApplies ? DECK_RESULT : null,
      tagFor: (source: string) => (isAssumption(source) ? 'assumption' : 'meesho'),
      sources: {
        returnRate: categorySource(inputs.categoryId, 'returnRateExpected'),
        writeOff: categorySource(inputs.categoryId, 'writeOffShare'),
        packaging: categorySource(inputs.categoryId, 'packagingCost'),
      },
    }
  }, [inputs, platform])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useProduct(): ProductInputsValue {
  const value = useContext(Context)
  if (!value) throw new Error('useProduct must be used inside <ProductInputsProvider>')
  return value
}
