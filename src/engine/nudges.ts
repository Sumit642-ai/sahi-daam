/**
 * Alert → WhatsApp-style message, in English and Hindi (spec section 8).
 *
 * The Hindi is written the way a small seller actually reads, not translated
 * from the English word for word: short sentences, everyday words, and the
 * terms that have no good Hindi equivalent left alone. Spec section 8 is
 * explicit that "RTO", "COD" and "₹" stay as they are.
 *
 * Each template is split into a `body` and a `cta`. Concatenated they are the
 * full message exactly as section 8 writes it; Screen 4 renders the body in the
 * chat bubble and puts the cta on the button beneath, so the seller does not
 * read "check your price" twice.
 *
 * Pure, framework-free. No React imports.
 */
import type { Alert, TriggerId } from './triggers'

export type Lang = 'en' | 'hi'

export interface NudgeParts {
  body: string
  cta: string
}

export interface NudgeOptions {
  /** The seller's name. Spec section 8 uses "Ramesh" for the demo. */
  name?: string
  /** The product, in the chosen language. Spec section 8: "कुर्ती / kurti". */
  product?: string
}

/** Spec section 8's demo seller and product. */
export const DEMO_SELLER = { en: 'Ramesh', hi: 'रमेश' }
export const DEMO_PRODUCT = { en: 'kurti', hi: 'कुर्ती' }

export const CTA: Record<Lang, string> = {
  en: 'Check your price →',
  hi: 'दाम जाँचें →',
}

/** The button label on each bubble (spec section 9.5). */
export const CHECK_BUTTON: Record<Lang, string> = {
  en: 'Daam check karein',
  hi: 'दाम जाँचें',
}

/**
 * The chrome around each bubble, translated too. Spec section 9.5 asks for the
 * alerts "in the selected language", and a Hindi message under an English
 * heading reads like a half-finished translation.
 */
export const TRIGGER_TITLE_BY_LANG: Record<Lang, Record<TriggerId, string>> = {
  en: {
    T1: 'Returns are climbing',
    T2: 'Festive RTO is coming',
    T3: 'A competitor has undercut you',
    T4: 'You have dropped out of view',
    T5: 'Your product cost changed',
    T6: 'You changed your price',
  },
  hi: {
    T1: 'वापसी बढ़ रही है',
    T2: 'त्योहार का RTO आ रहा है',
    T3: 'प्रतियोगी ने दाम घटाया',
    T4: 'आप ग्राहकों की नज़र से बाहर हैं',
    T5: 'आपकी लागत बदल गई',
    T6: 'आपने दाम बदला',
  },
}

export const SEVERITY_LABEL_BY_LANG: Record<Lang, Record<'info' | 'warn' | 'critical', string>> = {
  en: {
    info: 'For information',
    warn: 'Worth acting on',
    critical: 'Losing money now',
  },
  hi: {
    info: 'जानकारी के लिए',
    warn: 'ध्यान दीजिए',
    critical: 'अभी नुकसान हो रहा है',
  },
}

export const WEEK_LABEL: Record<Lang, string> = { en: 'Week', hi: 'सप्ताह' }

/** "Ramesh's kurti" / "रमेश की कुर्ती" for the chat header. */
export const sellerProduct: Record<Lang, (name: string, product: string) => string> = {
  en: (name, product) => `${name}’s ${product}`,
  hi: (name, product) => `${name} की ${product}`,
}

type Template = (n: Record<string, number | string>, name: string, product: string) => string

/**
 * One template per trigger per language. They read `alert.numbers`, which is
 * why every trigger populates the same placeholder names.
 */
const BODY: Record<TriggerId, Record<Lang, Template>> = {
  T1: {
    en: (n, name, product) =>
      `${name} ji, your ${product} is coming back more often — returns have gone from ` +
      `${n.returnOld}% to ${n.returnNew}%. Your true minimum price has moved from ₹${n.floorOld} ` +
      `to ₹${n.floorNew}. ` +
      (Number(n.loss) > 0
        ? `At ₹${n.price} you now lose ₹${n.loss} on every order. `
        : `At ₹${n.price} you are left with only ₹${n.profit} per order. `) +
      `Raise the price to ₹${n.suggested}, or fix the listing — size chart and photos.`,
    hi: (n, name, product) =>
      `${name} जी, आपकी ${product} ज़्यादा वापस आ रही है — वापसी ${n.returnOld}% से बढ़कर ` +
      `${n.returnNew}% हो गई है। आपका सही न्यूनतम दाम ₹${n.floorOld} से बढ़कर ₹${n.floorNew} हो गया है। ` +
      (Number(n.loss) > 0
        ? `अभी ₹${n.price} पर हर ऑर्डर पर ₹${n.loss} का नुकसान हो रहा है। `
        : `अभी ₹${n.price} पर हर ऑर्डर पर सिर्फ़ ₹${n.profit} बच रहे हैं। `) +
      `दाम ₹${n.suggested} कीजिए, या लिस्टिंग ठीक कीजिए — साइज़ चार्ट और फ़ोटो।`,
  },

  // Spec section 8 gives this one verbatim; the Hindi below is that template.
  T2: {
    en: (n, name, product) =>
      `${name} ji, RTO goes up in the festive season. Your ${product}'s true minimum price has ` +
      `risen from ₹${n.floorOld} to ₹${n.floorNew}. You are selling at ₹${n.price} right now — ` +
      (Number(n.loss) > 0
        ? `a loss of ₹${n.loss} on every order.`
        : `that leaves just ₹${n.profit} on every order.`),
    hi: (n, name, product) =>
      `${name} जी, त्योहार के मौसम में RTO बढ़ जाता है। आपकी ${product} का सही न्यूनतम दाम ` +
      `₹${n.floorOld} से बढ़कर ₹${n.floorNew} हो गया है। अभी आप ₹${n.price} पर बेच रहे हैं — ` +
      (Number(n.loss) > 0
        ? `हर ऑर्डर पर ₹${n.loss} का नुकसान।`
        : `हर ऑर्डर पर सिर्फ़ ₹${n.profit} बचते हैं।`),
  },

  T3: {
    en: (n, name) =>
      `${name} ji, the listings closest to yours have dropped to ₹${n.competitorPrice} — ` +
      `${n.dropPct}% below your ₹${n.price}. Your true minimum price is ₹${n.floor}. ` +
      (Number(n.safe) === 1
        ? `Matching them is safe: you would still keep ₹${n.profitIfMatched} per order.`
        : `Matching them would lose you ₹${n.lossIfMatched} on every order — do not cut the price without checking first.`),
    hi: (n, name) =>
      `${name} जी, आपके आसपास की लिस्टिंग ₹${n.competitorPrice} पर आ गई हैं — आपके ₹${n.price} से ` +
      `${n.dropPct}% कम। आपका सही न्यूनतम दाम ₹${n.floor} है। ` +
      (Number(n.safe) === 1
        ? `उनके बराबर दाम करना ठीक है — फिर भी हर ऑर्डर पर ₹${n.profitIfMatched} बचेंगे।`
        : `उनके बराबर दाम करने पर हर ऑर्डर पर ₹${n.lossIfMatched} का नुकसान होगा — बिना जाँचे दाम मत घटाइए।`),
  },

  T4: {
    en: (n, name, product) =>
      `${name} ji, your ${product} was shown to ${n.impressionsDrop}% fewer buyers this week, ` +
      `but the market did not slow down. At ₹${n.price} you are at the ${n.percentile}th ` +
      `percentile — dearer than most shops, so buyers are not seeing you.`,
    hi: (n, name, product) =>
      `${name} जी, इस हफ़्ते आपकी ${product} ${n.impressionsDrop}% कम ग्राहकों को दिखी, जबकि बाज़ार ` +
      `में कोई कमी नहीं आई। ₹${n.price} पर आप बाज़ार के ${n.percentile}वें पायदान पर हैं — ` +
      `ज़्यादातर दुकानों से महँगे, इसलिए ग्राहक आपको देख नहीं पा रहे।`,
  },

  T5: {
    en: (n, name) =>
      `${name} ji, your cost has gone ${n.direction} from ₹${n.cogsOld} to ₹${n.cogsNew}, a ` +
      `${n.cogsChangePct}% change. Your true minimum price is now ₹${n.floorNew}, not ` +
      `₹${n.floorOld}. ` +
      (Number(n.loss) > 0
        ? `At ₹${n.price} that is a loss of ₹${n.loss} on every order.`
        : `At ₹${n.price} that leaves you ₹${n.profit} per order.`),
    hi: (n, name) =>
      `${name} जी, आपकी लागत ₹${n.cogsOld} से ₹${n.cogsNew} हो गई है — ${n.cogsChangePct}% का फ़र्क़। ` +
      `अब आपका सही न्यूनतम दाम ₹${n.floorNew} है, ₹${n.floorOld} नहीं। ` +
      (Number(n.loss) > 0
        ? `₹${n.price} पर हर ऑर्डर पर ₹${n.loss} का नुकसान।`
        : `₹${n.price} पर हर ऑर्डर पर ₹${n.profit} बचते हैं।`),
  },

  T6: {
    en: (n, name) =>
      `${name} ji, you changed the price from ₹${n.priceOld} to ₹${n.price}. Your true minimum ` +
      `price is ₹${n.floor}, so ` +
      (Number(n.losing) === 1
        ? `you now lose ₹${n.loss} on every order.`
        : `you now make ₹${n.profit} on every order.`),
    hi: (n, name) =>
      `${name} जी, आपने दाम ₹${n.priceOld} से ₹${n.price} कर दिया है। आपका सही न्यूनतम दाम ` +
      `₹${n.floor} है, इसलिए ` +
      (Number(n.losing) === 1
        ? `अब हर ऑर्डर पर ₹${n.loss} का नुकसान हो रहा है।`
        : `अब हर ऑर्डर पर ₹${n.profit} बच रहे हैं।`),
  },
}

/** The message for an alert, split into bubble text and button text. */
export function nudgeFor(alert: Alert, lang: Lang, options: NudgeOptions = {}): NudgeParts {
  const name = options.name ?? DEMO_SELLER[lang]
  const product = options.product ?? DEMO_PRODUCT[lang]
  return {
    body: BODY[alert.id][lang](alert.numbers, name, product),
    cta: CTA[lang],
  }
}

/**
 * Body and cta as one string — the message exactly as spec section 8 writes it.
 * Used by the tests that check the templates against the spec.
 */
export function nudgeText(alert: Alert, lang: Lang, options: NudgeOptions = {}): string {
  const { body, cta } = nudgeFor(alert, lang, options)
  return `${body} ${cta}`
}
