/**
 * Feature flags (spec v2, section 14): anything unfinished stays off, so
 * nothing half-built is visible once mvp merges to main.
 */
export const FLAGS = {
  /** Report upload, mapping screen and reconciliation (Phase B). */
  reportUpload: true,
  /** "X sellers · Y products checked" — only once ≥ 10 sellers are activated (7.1). */
  socialProof: false,
} as const
