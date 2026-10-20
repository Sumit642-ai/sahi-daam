import { useI18n, type TranslationKey } from '../i18n'

/**
 * The input-provenance chip: every input field shows a small tag saying who
 * provides it. Full input/output transparency is a mentor requirement, so the chip is
 * never optional — a field without one is a bug.
 *
 * The spec names the three tags in Hinglish ("Aap bhariye", "Meesho ne bhara");
 * the dictionary carries both languages.
 */
/**
 * `listing` is for what Meesho already knows from the product listing itself —
 * its category and its packed weight — so the seller is never asked twice.
 */
export type Provider = 'seller' | 'listing' | 'meesho' | 'assumption'

interface TagSpec {
  labelKey: TranslationKey
  helpKey: TranslationKey
  className: string
}

export const PROVIDERS: Record<Provider, TagSpec> = {
  seller: { labelKey: 'tag.seller', helpKey: 'tag.sellerHelp', className: 'bg-plum/10 text-plum' },
  listing: {
    labelKey: 'tag.listing',
    helpKey: 'tag.listingHelp',
    className: 'bg-profit/10 text-profit',
  },
  meesho: {
    labelKey: 'tag.meesho',
    helpKey: 'tag.meeshoHelp',
    className: 'bg-orange/15 text-[#8A4408]',
  },
  assumption: {
    labelKey: 'tag.assumption',
    helpKey: 'tag.assumptionHelp',
    className: 'bg-body/10 text-body',
  },
}

interface SourceTagProps {
  provider: Provider
  className?: string
}

export function SourceTag({ provider, className = '' }: SourceTagProps) {
  const { t } = useI18n()
  const spec = PROVIDERS[provider]
  return (
    <span
      title={t(spec.helpKey)}
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ${spec.className} ${className}`}
    >
      {t(spec.labelKey)}
    </span>
  )
}
