/**
 * content.js — every word on the landing page, in one place.
 *
 * One export per section, in page order. Edit the strings freely; the
 * components only read from here. Rules the copy follows:
 *   - Slovenian only.
 *   - No em dashes or en dashes. Use a period, a comma or a plain hyphen.
 *   - One label per intent: the signup button always says `cta.signup`.
 *   - Prices and the plan features come from src/core/pricing.js, shared with
 *     the app's paywall, so the page sells exactly what the app does.
 *
 * Every word about the free trial comes from trialCopy() in
 * src/core/pricing.js, so it flips with the payments switch.
 *
 * `mock` at the bottom holds the realistic data shown inside the phone and
 * the bento tiles (workouts, paces, chat). It is example data, not a claim.
 */

import { trialCopy } from '../core/pricing.js'

/** Trial wording for the current payments state (pricing.js). */
const TRIAL = trialCopy()

/** Shared button labels and destinations. Used in nav, hero, pricing and the final CTA. */
export const cta = {
  signup: 'Začni brezplačno',
  login: 'Prijava',
  howItWorks: 'Kako deluje',
  // Existing app screens. /auth opens on the signup tab when mode=signup.
  signupHref: '/auth?mode=signup',
  loginHref: '/auth',
}

export const meta = {
  brand: 'Runko',
  // <title> and meta description live in index.html (static, for crawlers).
}

/**
 * Phase 3 slots. Set a path (e.g. '/landing/plan.png', file in /public) and
 * the phone shows that image instead of the drawn screen. null = drawn screen.
 */
export const slots = {
  heroPhone: null,
  howPhones: { goal: null, plan: null, log: null, adapt: null },
}

// ---------------------------------------------------------------------------
// 1. Navigacija
// ---------------------------------------------------------------------------
export const nav = {
  links: [
    { label: 'Kako deluje', href: '#kako-deluje' },
    { label: 'Funkcije', href: '#funkcije' },
    { label: 'Cene', href: '#cene' },
    { label: 'FAQ', href: '#faq' },
  ],
  openMenu: 'Odpri meni',
  closeMenu: 'Zapri meni',
  homeLabel: 'Runko, na vrh strani',
  ariaLabel: 'Glavna navigacija',
}

// ---------------------------------------------------------------------------
// 2. Hero
// ---------------------------------------------------------------------------
export const hero = {
  titleStart: 'Tvoj osebni',
  titleAccent: 'AI trener teka.',
  subtitle:
    'Runko sestavi personaliziran tekaški program glede na tvoj cilj, čas in zmogljivost, zraven pa ti daje še nasvete.',
  phoneLabel: 'Zaslon aplikacije Runko s tedenskim načrtom treningov',
  // The four "inputs" floating around the phone: what the runner tells Runko.
  inputs: [
    { key: 'goal', label: 'Cilj', value: 'Polmaraton pod 2:00' },
    { key: 'date', label: 'Datum tekme', value: '18. 4. 2027' },
    { key: 'fitness', label: 'Trenutna forma', value: '10 km v 54:30' },
    { key: 'time', label: 'Čas na teden', value: '4 dni, do 4 ure' },
  ],
}

// ---------------------------------------------------------------------------
// 3. Trak zaupanja
// ---------------------------------------------------------------------------
export const trust = {
  label: 'Kaj stoji za Runkom',
  items: [
    { key: 'science', value: 'Temelji na športni znanosti', text: 'Načrti sledijo preverjenim načelom treninga, AI trener pa združuje znanje priznanih strokovnjakov.' },
    { key: 'range', value: 'Od prvega kilometra do maratona', text: 'Za začetnike, rekreativce in tekmovalce.' },
    { key: 'trial', value: TRIAL.short, text: TRIAL.trustText },
  ],
}

// ---------------------------------------------------------------------------
// 4. Kako deluje
// ---------------------------------------------------------------------------
export const how = {
  id: 'kako-deluje',
  title: 'Od cilja do štartne črte',
  intro: 'Runko izve vse o tebi in na podlagi tega sestavi prilagojen trening.',
  steps: [
    {
      key: 'goal',
      title: 'Povej svoj cilj',
      text: 'Izbereš želeni cilj, opišeš trenutno formo in koliko dni na teden lahko tečeš.',
    },
    {
      key: 'plan',
      title: 'Dobi svoj načrt',
      text: 'Runko razdeli pripravo na faze in za vsak dan določi trening z natančnimi navodili, tudi za popolne začetnike.',
    },
    {
      key: 'log',
      title: 'Teci in vpiši',
      text: 'Po teku vpišeš razdaljo, čas in kako naporno je bilo. Traja nekaj sekund.',
    },
    {
      key: 'adapt',
      title: 'Trener prilagodi',
      text: 'Če so treningi prenaporni ali prelahki ali se zgodi kaj nepričakovanega, trener prilagodi trening.',
    },
  ],
  phoneLabel: 'Zaslon aplikacije za korak',
}

// ---------------------------------------------------------------------------
// 5. Poglavje: Plan
// ---------------------------------------------------------------------------
export const plan = {
  id: 'funkcije',
  eyebrow: 'Načrt',
  title: 'Prilagojen plan za tvoj cilj',
  intro:
    'Vsak teden ima svoj namen. Trener ti sestavi celoten plan do tekme, z razlago kako in zakaj. Prav tako pa pripravi program za vse, ki želijo samo teči, brez tekme v koledarju.',
  phases: {
    title: 'Faze priprave na tekmo',
    text: 'Osnova, nadgradnja, ostrenje in razbremenitev pred tekmo.',
    axis: 'km na teden',
  },
  feasibility: {
    title: 'Je cilj realen?',
    text: 'Preden začneš, Runko preveri, ali je cilj dosegljiv v času, ki ga imaš.',
    zones: ['Realno', 'Zahtevno', 'Tvegano'],
    verdict: 'Realno',
    detail: 'Polmaraton pod 2:00 v 16 tednih',
  },
  // "Tek brez tekme" tile: a four-week calendar with only the run days lit.
  free: {
    title: 'Tek brez tekme',
    text: 'Nimaš tekme? Runko pripravi plan za kondicijo, zdravje in veselje do teka.',
    weekdays: ['P', 'T', 'S', 'Č', 'P', 'S', 'N'],
    runDays: [1, 3, 5], // 0 = ponedeljek
    weeks: 4,
    caption: '3 teki na teden',
  },
  week: {
    title: 'Povzetek tvojega tedna',
    text: 'Program je razdeljen na tedne, tako vedno veš, kaj te čaka in kaj si že opravil.',
  },
}

// ---------------------------------------------------------------------------
// 6. Poglavje: Trener
// ---------------------------------------------------------------------------
export const coach = {
  eyebrow: 'Trener',
  title: 'Trener, ki si zapomni',
  intro:
    'Trener pozna preverjene metode, znanje strokovnjakov in študije. Hkrati je tvoj osebni trener, ki si zapomni vse, kar mu poveš, in to tudi upošteva.',
  chatLabel: 'Primer pogovora s trenerjem Runko',
  coachName: 'Trener',
  memoryLabel: 'Zapomnil si je',
}

// ---------------------------------------------------------------------------
// 7. Poglavje: Napredek
// ---------------------------------------------------------------------------
export const progress = {
  eyebrow: 'Napredek',
  title: 'Spremljaj svoj napredek',
  intro:
    'Sproti vpisuj svoje teke in spremljaj napredek. Tak trener te tudi motivira: napredek postane kot igra, trener pa te ves čas spodbuja.',
  quickLog: { title: 'Hiter vpis', text: 'Razdalja, čas, napor. Gotovo.' },
  weekly: { title: 'Tedenski pregled', text: 'Zadnjih šest tednov v kilometrih.' },
  goal: { title: 'Pot do cilja', text: 'Koliko priprave je za tabo in koliko še pred tabo.' },
}

// ---------------------------------------------------------------------------
// 8. Za koga
// ---------------------------------------------------------------------------
export const audience = {
  title: 'Za tekače vseh vrst',
  intro:
    'Načrt je najprej prilagojen tebi, tvojim zmožnostim in zdravju, šele nato cilju. Namenjen je tekačem vseh vrst, od popolnih začetnikov do tistih, ki se pripravljajo na resne tekme.',
  prev: 'Prejšnji',
  next: 'Naslednji',
  exampleLabel: 'Primer tedna',
  // `image`: phase 3 slot for a 4:5 portrait photo. When set, it replaces the icon.
  items: [
    {
      key: 'beginner',
      title: 'Začetniki',
      text: 'Začneš čisto od začetka in počasi napreduješ. Za rekreacijo ali za svoj prvi rezultat.',
      example: '3 treningi hoja-tek po 20 min, najdaljši 30 min',
      image: null,
    },
    {
      key: 'recreational',
      title: 'Rekreativci',
      text: 'Tečeš redno, rad bi izboljšal zmogljivost in prvič dosegel lep rezultat.',
      example: '4 teki, najdaljši 12 km, en tempo tek',
      image: null,
    },
    {
      key: 'firstlong',
      title: 'Prvi polmaraton ali maraton',
      text: 'Postopna priprava na prvo dolgo razdaljo, z različnimi tipi treningov in razbremenitvijo pred tekmo.',
      example: '4 teki, dolgi tek 18 km, lahkoten tek s pospeški',
      image: null,
    },
    {
      key: 'competitive',
      title: 'Tekmovalci',
      text: 'Loviš osebni rekord ali ciljni čas in rabiš strukturiran plan, da prideš na štart pripravljen.',
      example: '6 tekov, intervali 6 × 1000 m, dolgi tek 24 km',
      image: null,
    },
    {
      key: 'returning',
      title: 'Po premoru',
      text: 'Nekaj časa nisi tekel ali se vračaš po poškodbi in bi rad postopoma pridobil nazaj kondicijo.',
      example: '3 lahkotni teki po 25 min, brez hitrih delov',
      image: null,
    },
  ],
}

// ---------------------------------------------------------------------------
// 10. Primerjava
// ---------------------------------------------------------------------------
export const comparison = {
  title: 'Runko ali kaj drugega?',
  intro: 'Primerjava z načrtom iz spleta in z osebnim trenerjem.',
  columns: ['Runko', 'Načrt PDF s spleta', 'Osebni trener'],
  // value: true = yes, false = no, string = shown as text.
  rows: [
    { label: 'Prilagojeno tebi', values: [true, false, true], notes: ['Tvoj cilj, forma in čas', 'Enak za vse', null] },
    { label: 'Se prilagaja sproti', values: [true, false, true], notes: ['Po vsakem vpisu', null, 'Ob posvetih'] },
    { label: 'Na voljo 24/7', values: [true, true, false], notes: [null, 'A ne odgovarja', 'V dogovorjenem času'] },
    { label: 'Cena', values: ['Od 5,00 € / mesec', 'Brezplačno', 'Po dogovoru'], notes: ['Paket Start, letno', null, null] },
  ],
  yes: 'Da',
  no: 'Ne',
}

// ---------------------------------------------------------------------------
// 11. Cene
// ---------------------------------------------------------------------------
export const pricing = {
  id: 'cene',
  title: 'Preprosto. Brez presenečenj.',
  intro: TRIAL.intro,
  toggleLabel: 'Način plačila',
  yearly: 'Letno',
  monthly: 'Mesečno',
  yearlyHint: 'do -42 %',
  perMonth: '/ mes',
  billedYearly: (amount, saving) => `${amount} letno, prihraniš ${saving.replace('-', '')}`,
  billedMonthly: 'Plačilo vsak mesec',
  featuredBadge: 'Priporočeno',
  notIncluded: 'Ni vključeno',
  // The pricing CTA names the trial; it is the same signup destination as cta.signup.
  trialCta: TRIAL.cta,
  facts: TRIAL.facts,
  // Prices, savings, the plans and their features: src/core/pricing.js.
}

// ---------------------------------------------------------------------------
// 12. FAQ
// ---------------------------------------------------------------------------
export const faq = {
  id: 'faq',
  title: 'Pogosta vprašanja',
  items: [
    {
      q: 'Ali potrebujem športno uro?',
      a: 'Ne. Za začetek je dovolj, da izmeriš razdaljo in čas, kar lahko narediš s telefonom. Pri zahtevnejših ciljih pa priporočamo tudi merjenje srčnega utripa.',
    },
    {
      q: 'Sem popoln začetnik. Je Runko zame?',
      a: 'Da. Začetniki začnejo čisto počasi, cilj prvih tednov pa je, da postopoma pretečeš 30 minut brez ustavljanja.',
    },
    {
      q: 'Kaj, če izpustim trening?',
      a: 'Nič hudega. Vpišeš, kar si naredil, trener pa prilagodi naslednje dni, tako da ti ničesar ni treba nadoknaditi na silo.',
    },
    {
      q: 'Na katere tekme se lahko pripravim?',
      a: 'Na cestne tekme od 5 km do maratona. Gorskih tekov in ultramaratonov za zdaj ne načrtujemo.',
    },
    // Existing question that is not in the copy update: kept as it was.
    {
      q: 'Kako se trener spomni mojih podatkov?',
      a: 'Trener si zapomni pomembne stvari iz vajinih pogovorov, na primer bolečine ali termine. V nastavitvah vidiš, kaj si je zapomnil.',
    },
    {
      q: 'Kaj, če se ne pripravljam na tekmo?',
      a: 'Runko je še vedno prava izbira, saj pripravi plan tudi za rekreacijo, zdravje in boljšo kondicijo.',
    },
    TRIAL.faqAfter,
    // Only while payments are on: before that there is nothing to cancel.
    ...(TRIAL.faqCancel ? [TRIAL.faqCancel] : []),
    {
      q: 'So moji podatki varni?',
      a: 'Da. Zbiramo le podatke, ki jih načrt res potrebuje, zdravstveni profil je neobvezen, z vsemi podatki pa ravnamo v skladu z GDPR.',
    },
    {
      q: 'Ali Runko nadomešča zdravnika?',
      a: 'Ne. Runko je pripomoček za načrtovanje treninga. Če imaš resne zdravstvene težave, se pred začetkom posvetuj z zdravnikom.',
    },
  ],
}

// ---------------------------------------------------------------------------
// 13. Zaključni poziv
// ---------------------------------------------------------------------------
export const finalCta = {
  marquee: ['Tvoj cilj', 'Tvoj tempo', 'Tvoja tekma'],
  title: 'Naslednji tek je lahko prvi v pravem načrtu.',
  text: TRIAL.finalCta,
}

// ---------------------------------------------------------------------------
// 14. Noga
// ---------------------------------------------------------------------------
export const footer = {
  tagline: 'Tvoj AI tekaški trener.',
  navLabel: 'Povezave v nogi strani',
  // TODO: real pages. Placeholders until the legal pages exist.
  links: [
    { label: 'Politika zasebnosti', href: '#' },
    { label: 'Pogoji uporabe', href: '#' },
    { label: 'Kontakt', href: 'mailto:info@runko.app' },
  ],
  // TODO: real profile URLs.
  social: [
    { key: 'instagram', label: 'Runko na Instagramu', href: '#' },
    { key: 'tiktok', label: 'Runko na TikToku', href: '#' },
    { key: 'facebook', label: 'Runko na Facebooku', href: '#' },
  ],
  copyright: `© ${new Date().getFullYear()} Runko`,
}

// ---------------------------------------------------------------------------
// Mock data shown inside the phone and the tiles. Example data only.
// ---------------------------------------------------------------------------
export const mock = {
  week: {
    label: 'Teden 7 od 16',
    phase: 'Nadgradnja',
    total: '38 km',
    days: [
      { day: 'Pon', type: 'rest', title: 'Počitek' },
      { day: 'Tor', type: 'easy', title: 'Lahkotni tek', km: '8 km', pace: '6:15-6:45/km', done: true },
      { day: 'Sre', type: 'rest', title: 'Počitek' },
      { day: 'Čet', type: 'tempo', title: 'Tempo tek', km: '9 km', pace: '3 × 2 km @ 5:15/km', today: true },
      { day: 'Pet', type: 'rest', title: 'Počitek' },
      { day: 'Sob', type: 'easy', title: 'Lahkotni tek s pospeški', km: '6 km', pace: '6:15-6:45/km' },
      { day: 'Ned', type: 'long', title: 'Dolgi tek', km: '15 km', pace: '6:20-6:50/km' },
    ],
    today: 'Danes',
  },
  // Weekly km for the 16-week half-marathon plan, by phase.
  phases: [
    { key: 'base', label: 'Osnova', weeks: [24, 26, 28, 22, 30] },
    { key: 'build', label: 'Nadgradnja', weeks: [32, 34, 38, 30, 40] },
    { key: 'sharpen', label: 'Ostrenje', weeks: [42, 44, 36, 44] },
    { key: 'taper', label: 'Razbremenitev', weeks: [30, 21] },
  ],
  onboarding: {
    question: 'Za katero razdaljo treniraš?',
    options: ['5 km', '10 km', 'Polmaraton', 'Maraton'],
    selected: 'Polmaraton',
    dateLabel: 'Datum tekme',
    date: '18. 4. 2027',
    daysLabel: 'Dni teka na teden',
    days: ['3', '4', '5', '6'],
    daysSelected: '4',
    next: 'Naprej',
  },
  planOverview: {
    title: 'Polmaraton',
    subtitle: '16 tednov do 18. 4. 2027',
    goalLabel: 'Ciljni čas',
    goal: '1:59:00',
  },
  log: {
    title: 'Vpiši trening',
    workout: 'Dolgi tek',
    fields: [
      { label: 'Razdalja', value: '15,2', unit: 'km' },
      { label: 'Čas', value: '1:38:40', unit: '' },
      { label: 'Povprečni tempo', value: '6:29', unit: '/km' },
    ],
    effortLabel: 'Kako naporno je bilo?',
    effort: 6,
    asPlanned: 'Opravljeno kot načrtovano',
    save: 'Shrani',
  },
  adapt: {
    message:
      'Nedeljski dolgi tek si ocenila z 8 od 10, kar je več od načrtovanega. Naslednji teden ga skrajšam s 16 na 14 km, tempo ostane enak.',
    changeLabel: 'Sprememba v načrtu',
    workout: 'Dolgi tek, nedelja',
    from: '16 km',
    to: '14 km',
    updated: 'Načrt posodobljen',
    coachName: 'Trener',
  },
  chat: [
    { from: 'user', text: 'Ta teden imam v četrtek in petek službeno pot. Kako naj prestavim treninge?' },
    {
      from: 'coach',
      text: 'Brez skrbi. Tempo tek prestavim na sredo, sobotni lahkotni tek pa skrajšam na 5 km, da boš v nedeljo spočita za dolgi tek.',
    },
    {
      from: 'coach',
      text: 'Ker si prejšnji mesec omenila, da te po dolgih tekih boli leva meča, začni v nedeljo počasneje: prve 3 km po 6:50/km.',
      memory: 'Bolečina v levi meči po dolgih tekih',
    },
    { from: 'user', text: 'Hvala! Lahko v hotelu tečem na tekoči preprogi?' },
    {
      from: 'coach',
      text: 'Lahko. Nastavi naklon na 1 %, da bo bolj podobno teku zunaj, in teci jutranji termin, kot si navajena.',
      memory: 'Najraje teče zjutraj',
    },
  ],
  memories: ['Cilj: polmaraton pod 2:00', 'Bolečina v levi meči po dolgih tekih', 'Najraje teče zjutraj'],
  weeklyKm: [
    { label: 'T2', km: 26 },
    { label: 'T3', km: 28 },
    { label: 'T4', km: 22 },
    { label: 'T5', km: 30 },
    { label: 'T6', km: 32 },
    { label: 'T7', km: 36.4 },
  ],
  weeklySummary: { number: 36.4, unit: 'km', label: 'ta teden', runs: '4 od 4 treningov' },
  goalProgress: { weeksDone: 7, weeksTotal: 16, left: 'Še 9 tednov', race: 'Polmaraton, 18. 4. 2027' },
}
