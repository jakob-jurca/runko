/**
 * pricing.js — the two plans, their prices and what each includes.
 *
 * One file for the in-app paywall and the landing page, so the page cannot
 * promise what the app does not sell. Pure data, no imports: the landing
 * bundle loads it without pulling in any of the app.
 *
 * Prices are final amounts, VAT included. The limits behind the feature lines
 * are enforced on the server (supabase/functions/_shared/entitlements.js);
 * tests/pricing.test.mjs checks the two agree.
 */

export const TRIAL_DAYS = 14

/** Cents. Must match PRICES in supabase/functions/_shared/stripe.js. */
export const PLAN_PRICES = {
  start: { month: 799, year: 5999 },
  pro: { month: 1299, year: 8999 },
}

/** "7,99 €" */
export function euros(cents) {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

/** What a yearly plan costs a month, rounded to the cent: 59,99 € -> "5,00 €". */
export const perMonthOfYear = (tier) => euros(Math.round(PLAN_PRICES[tier].year / 12))

/** Percent saved by paying yearly: Start 37, Pro 42. */
export const yearlySavingPct = (tier) =>
  Math.round((1 - PLAN_PRICES[tier].year / (PLAN_PRICES[tier].month * 12)) * 100)

/**
 * The feature matrix. `start` / `pro`: true, false, or the text to show.
 */
export const FEATURES = [
  { key: 'plan', label: 'Osebni načrt s samodejnim prilagajanjem', start: true, pro: true },
  { key: 'injury', label: 'Gumb »Poškodba / bolezen«', start: true, pro: true },
  { key: 'chat', label: 'Pogovor s trenerjem', start: '10 sporočil na dan', pro: '50 sporočil na dan' },
  { key: 'rebuild', label: 'Nov načrt za nov cilj', start: '1-krat na mesec', pro: 'Neomejeno' },
  { key: 'review', label: 'Tedenski pregled napredka', start: false, pro: true },
]

export const PLANS = [
  { tier: 'start', name: 'Start', tagline: 'Načrt, ki se prilagaja, in trener, ko ga potrebuješ.' },
  { tier: 'pro', name: 'Pro', tagline: 'Več pogovora s trenerjem, nov cilj kadarkoli in tedenski pregled.', featured: true },
]

/** One plan's price for display in the chosen billing interval. */
export function displayPrice(tier, interval) {
  const p = PLAN_PRICES[tier]
  if (interval === 'year') {
    return {
      main: perMonthOfYear(tier),
      unit: '/mes',
      billed: `${euros(p.year)} letno`,
      saving: `-${yearlySavingPct(tier)} %`,
    }
  }
  return { main: euros(p.month), unit: '/mes', billed: 'mesečno', saving: null }
}

export const FOUNDING_NOTE = 'Ustanovni člani: -25 % prvo leto, omejeno na prvih 50'

export const TRIAL_LINE =
  'Preizkus traja 14 dni. Ob koncu se kartica samodejno bremeni za izbrani paket. Prekličeš lahko kadarkoli prej.'
