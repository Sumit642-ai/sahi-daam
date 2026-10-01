import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import en from './data/i18n/en.json'
import hi from './data/i18n/hi.json'

/**
 * Language and Judge mode (spec sections 3 and 9).
 *
 * Both live here because they are the two global switches in the top bar, and
 * both change what every screen renders.
 *
 * Judge mode does two things (spec section 9): it opens every ⓘ formula panel
 * by default instead of hiding them behind the icon, and it reveals the
 * simulator's hidden assumptions — the true price sensitivity ε = 2.2 — beside
 * what the learner managed to work out on its own.
 *
 * Numbers are never translated. Spec section 3 keeps them in Indian digit
 * grouping in both languages, and `format.ts` already does that.
 */
export type Lang = 'en' | 'hi'

export type TranslationKey = keyof typeof en

const DICTIONARIES: Record<Lang, Record<string, string>> = { en, hi }

interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  judge: boolean
  setJudge: (judge: boolean) => void
  /** Translate, with optional {placeholder} substitution. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  /** Pick the right one of a pair the engine already carries in both languages. */
  pick: (pair: { en: string; hi: string }) => string
}

const Context = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')
  const [judge, setJudge] = useState(false)

  const value = useMemo<I18nValue>(() => {
    const dictionary = DICTIONARIES[lang]
    const fallback = DICTIONARIES.en

    const t = (key: TranslationKey, vars?: Record<string, string | number>) => {
      // Falling back to English is better than printing a dot-notation key in
      // the middle of a demo; the generator makes a miss unlikely anyway.
      let text = dictionary[key] ?? fallback[key] ?? key
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(replacement))
        }
      }
      return text
    }

    return {
      lang,
      setLang,
      judge,
      setJudge,
      t,
      pick: (pair) => (lang === 'hi' ? pair.hi : pair.en),
    }
  }, [lang, judge])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(Context)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}

/** Shorthand for the common case. */
export function useT() {
  return useI18n().t
}
