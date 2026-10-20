/**
 * MVP language (English / हिंदी), spec v2 sections 7.2 and 13.
 *
 * The chosen language lives on the shop record, so it survives a reload and
 * is part of a backup. Before a shop exists (the landing page) it is held in
 * localStorage as a per-device convenience. Switching is instant and never
 * touches product data (spec 8.2).
 *
 * Numbers are never translated: ₹ amounts keep Indian digit grouping in both.
 * The story pages under /how-it-works keep their own dictionary (src/story/i18n.tsx).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { Lang } from '../app/db'
import { getShop, saveShop } from '../app/repo'
import en from './en.json'
import hi from './hi.json'

export type MessageKey = keyof typeof en

export const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = {
  en,
  hi: hi as Record<MessageKey, string>,
}

const STORAGE_KEY = 'sahi-daam.lang'

function readStoredLang(): Lang | null {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY)
    return v === 'en' || v === 'hi' ? v : null
  } catch {
    return null
  }
}

function storeLang(lang: Lang) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang)
  } catch {
    // Private windows can refuse storage; the language still switches for this visit.
  }
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let text = DICTIONARIES[lang][key] ?? DICTIONARIES.en[key] ?? key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value))
  }
  return text
}

interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Translate
  /** Pick from a pair the data files already carry in both languages. */
  pick: (pair: { en: string; hi: string }) => string
}

const Context = createContext<I18nValue | null>(null)

export function I18nProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const shop = useLiveQuery(() => getShop().catch(() => undefined), [])
  const [lang, setLangState] = useState<Lang>(initialLang ?? readStoredLang() ?? 'en')

  // The shop's saved language wins once it has loaded.
  useEffect(() => {
    if (shop?.language) setLangState(shop.language)
  }, [shop?.language])

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next)
      storeLang(next)
      if (shop) void saveShop({ language: next })
    },
    [shop],
  )

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      pick: (pair) => (lang === 'hi' ? pair.hi : pair.en),
    }),
    [lang, setLang],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(Context)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}

export function useT(): Translate {
  return useI18n().t
}
