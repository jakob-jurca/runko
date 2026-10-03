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

/**
 * Are payments on? The server decides for the app (access.paymentsEnabled,
 * from the PAYMENTS_ENABLED Supabase secret). The landing page has no server
 * call, so it reads the same switch at build time: VITE_PAYMENTS_ENABLED on
 * Vercel. Both flip together (PROGRESS.md, Before launch). Vite replaces
 * import.meta.env at build time; under Node (tests) it is undefined: off.
 */
export const PAYMENTS_LIVE = import.meta.env?.VITE_PAYMENTS_ENABLED === 'true'

/**
 * Every word about the free trial, in one place, for both states:
 *   live  14 days, card at the start, charged automatically, cancel any time
 *   off   1 month, no card, nothing is charged, paid plans are coming
 * Used by the landing page, index.html (vite.config.js) and the app.
 */
export function trialCopy(live = PAYMENTS_LIVE) {
  if (live) {
    return {
      short: '14 dni brezplačno',
      cta: 'Začni 14 dni brezplačno',
      trustText: 'Preizkusi celoten načrt in trenerja, preden se odločiš.',
      intro: 'Prvih 14 dni je brezplačnih, z vsem, kar zna Pro. Potem izbereš paket, ki ti ustreza.',
      line: 'Preizkus traja 14 dni. Ob koncu se kartica samodejno bremeni za izbrani paket. Prekličeš lahko kadarkoli prej.',
      facts: [
        { key: 'trial', title: '14 dni brezplačno', text: 'Vse funkcije paketa Pro, tudi tedenski pregled.' },
        { key: 'card', title: 'Kartica ob začetku', text: 'Ob koncu preizkusa se samodejno zaračuna izbrani paket.' },
        { key: 'cancel', title: 'Prekličeš kadarkoli', text: 'Pred koncem preizkusa ne plačaš ničesar.' },
      ],
      finalCta: 'Nastavitev traja nekaj minut. Prvih 14 dni je brezplačnih.',
      faqAfter: {
        q: 'Kaj se zgodi po 14 dneh?',
        a: 'Ob koncu preizkusa se samodejno zaračuna izbrani paket. Če ga prej prekličeš, ne plačaš ničesar.',
      },
      faqCancel: {
        q: 'Kako prekličem naročnino?',
        a: 'Kadarkoli v Nastavitvah pod Naročnina, z enim klikom. Dostop ostane do konca plačanega obdobja.',
      },
      ogDescription: 'Tekaški načrt, ki se prilagaja tebi. Od 5 km do maratona, 14 dni brezplačno.',
    }
  }
  return {
    short: '1 mesec brezplačno, brez kartice',
    cta: 'Začni 1 mesec brezplačno',
    trustText: 'Brez kartice. Preizkusi celoten načrt in trenerja, preden se odločiš.',
    intro: 'Prvi mesec je brezplačen in brez kartice, z vsem, kar zna Pro. Plačljiva paketa Start in Pro prihajata kmalu.',
    line: 'Prvi mesec je brezplačen in brez kartice. Ko se izteče, se nič ne zaračuna.',
    facts: [
      { key: 'trial', title: '1 mesec brezplačno', text: 'Vse funkcije paketa Pro, tudi tedenski pregled.' },
      { key: 'card', title: 'Brez kartice', text: 'Za preizkus ne potrebuješ plačilne kartice.' },
      { key: 'cancel', title: 'Nič se ne zaračuna', text: 'Ko se preizkus izteče, ne plačaš ničesar. Plačljiva paketa prihajata kmalu.' },
    ],
    finalCta: 'Nastavitev traja nekaj minut. Prvi mesec je brezplačen, brez kartice.',
    faqAfter: {
      q: 'Kaj se zgodi po brezplačnem mesecu?',
      a: 'Nič se ne zaračuna. Plačljiva paketa Start in Pro prihajata kmalu. Ko bosta na voljo, se sam odločiš, ali nadaljuješ.',
    },
    // No subscription exists yet, so there is nothing to cancel.
    faqCancel: null,
    ogDescription: 'Tekaški načrt, ki se prilagaja tebi. Od 5 km do maratona, 1 mesec brezplačno, brez kartice.',
  }
}

/** @deprecated read trialCopy(true).line; kept for the paywall while payments are live. */
export const TRIAL_LINE = trialCopy(true).line
