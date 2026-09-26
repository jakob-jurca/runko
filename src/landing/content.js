/**
 * content.js — every word on the landing page, in one place.
 *
 * One export per section, in page order. Edit the strings freely; the
 * components only read from here. Rules the copy follows:
 *   - Slovenian only.
 *   - No em dashes or en dashes. Use a period, a comma or a plain hyphen.
 *   - One label per intent: the signup button always says `cta.signup`.
 *   - Prices are placeholders ("€ X") until pricing is final.
 *
 * `mock` at the bottom holds the realistic data shown inside the phone and
 * the bento tiles (workouts, paces, chat). It is example data, not a claim.
 */

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
  titleStart: 'Tekaški načrt, ki se',
  titleAccent: 'prilagaja tebi.',
  subtitle:
    'Povej, za katero tekmo treniraš in koliko časa imaš. Runko sestavi načrt po preverjenih metodah in ga sproti prilagaja.',
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
    { key: 'science', value: 'Temelji na športni znanosti', text: 'Načrti sledijo preverjenim načelom treninga, ne modnim trendom.' },
    { key: 'range', value: 'Od prvega kilometra do maratona', text: 'Za začetnike, rekreativce in tekmovalce.' },
    { key: 'trial', value: '1 mesec brezplačno', text: 'Preizkusi celoten načrt in trenerja, preden se odločiš.' },
  ],
}

// ---------------------------------------------------------------------------
// 4. Kako deluje
// ---------------------------------------------------------------------------
export const how = {
  id: 'kako-deluje',
  title: 'Od cilja do štartne črte',
  intro: 'Nekaj minut vprašanj na začetku, potem Runko skrbi za vsak teden posebej.',
  steps: [
    {
      key: 'goal',
      title: 'Povej svoj cilj',
      text: 'Izbereš razdaljo in datum tekme, opišeš trenutno formo in koliko dni na teden lahko tečeš.',
    },
    {
      key: 'plan',
      title: 'Dobi svoj načrt',
      text: 'Runko razdeli pripravo na faze in za vsak dan določi trening, razdaljo in tempo.',
    },
    {
      key: 'log',
      title: 'Teci in vpiši',
      text: 'Po teku vpišeš razdaljo, čas in kako naporno je bilo. Traja nekaj sekund.',
    },
    {
      key: 'adapt',
      title: 'Trener prilagodi',
      text: 'Če je bil teden pretežak ali si ga izpustil, trener popravi naslednje treninge.',
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
  title: 'Načrt, ki ve, kam gre',
  intro: 'Vsak teden ima svoj namen. Vidiš celotno pot do tekme in točno veš, zakaj tečeš, kar tečeš.',
  phases: {
    title: 'Faze priprave',
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
  effort: {
    title: 'Tempo po občutku',
    text: 'Poleg tempa na kilometer dobiš lestvico napora in test pogovora.',
    scaleLabel: 'Napor (RPE)',
    levels: [
      { range: '2-4', talk: 'Govoriš v celih stavkih.' },
      { range: '5-7', talk: 'Le kratki stavki.' },
      { range: '8-9', talk: 'Le posamezne besede.' },
    ],
  },
  week: {
    title: 'Tvoj teden na enem mestu',
    text: 'Treningi, počitek in skupna razdalja.',
  },
}

// ---------------------------------------------------------------------------
// 6. Poglavje: Trener
// ---------------------------------------------------------------------------
export const coach = {
  eyebrow: 'Trener',
  title: 'Trener, ki si zapomni',
  intro: 'Vprašaš ga kadar koli. Pozna tvoj načrt, tvoje pretekle treninge in vse, kar mu poveš.',
  chatLabel: 'Primer pogovora s trenerjem Runko',
  coachName: 'Trener',
  memoryLabel: 'Zapomnil si je',
}

// ---------------------------------------------------------------------------
// 7. Poglavje: Napredek
// ---------------------------------------------------------------------------
export const progress = {
  eyebrow: 'Napredek',
  title: 'Vidiš, da gre naprej',
  intro: 'Vsak vpisan trening se pozna v tedenskem pregledu in na poti do cilja.',
  quickLog: { title: 'Hiter vpis', text: 'Razdalja, čas, napor. Gotovo.' },
  weekly: { title: 'Tedenski pregled', text: 'Zadnjih šest tednov v kilometrih.' },
  goal: { title: 'Pot do cilja', text: 'Koliko priprave je za tabo in koliko še pred tabo.' },
}

// ---------------------------------------------------------------------------
// 8. Za koga
// ---------------------------------------------------------------------------
export const audience = {
  title: 'Za tekače vseh vrst',
  intro: 'Runko načrt najprej prilagodi temu, kdo si. Šele nato cilju.',
  prev: 'Prejšnji',
  next: 'Naslednji',
  exampleLabel: 'Primer tedna',
  // `image`: phase 3 slot for a 4:5 portrait photo. When set, it replaces the icon.
  items: [
    {
      key: 'beginner',
      title: 'Začetniki',
      text: 'Začneš z izmenjavo hoje in teka, brez pritiska. Prvi cilj je 30 minut teka brez ustavljanja.',
      example: '3 treningi hoja-tek po 20 min, najdaljši 30 min',
      image: null,
    },
    {
      key: 'recreational',
      title: 'Rekreativci',
      text: 'Tečeš redno in bi rad prvič pretekel 10 km z načrtom, ne le po občutku.',
      example: '4 teki, najdaljši 12 km, en tempo tek',
      image: null,
    },
    {
      key: 'firstlong',
      title: 'Prvi polmaraton ali maraton',
      text: 'Postopna priprava na prvo dolgo razdaljo, s tedni počitka in razbremenitvijo pred tekmo.',
      example: '4 teki, dolgi tek 18 km, lahkoten tek s pospeški',
      image: null,
    },
    {
      key: 'competitive',
      title: 'Tekmovalci',
      text: 'Loviš osebni rekord. Intervali, tempo teki in dolgi teki s ciljnim tempom.',
      example: '6 tekov, intervali 6 × 1000 m, dolgi tek 24 km',
      image: null,
    },
    {
      key: 'returning',
      title: 'Po premoru',
      text: 'Vrnitev je odvisna od tega, kako dolgo nisi tekel. Runko začne pri pravi točki.',
      example: '3 lahkotni teki po 25 min, brez hitrih delov',
      image: null,
    },
  ],
}

// ---------------------------------------------------------------------------
// 9. Varnost
// ---------------------------------------------------------------------------
export const safety = {
  title: 'Najprej varnost, potem kilometri',
  intro: 'Tek naj ti dodaja energijo, ne poškodb. Zato Runko najprej vpraša in šele nato načrtuje.',
  items: [
    {
      key: 'questions',
      title: 'Varnostna vprašanja ob začetku',
      text: 'Vprašamo o bolečinah, nedavnih poškodbah, premoru in počutju med tekom. Če kaj kaže na tveganje, načrt temu prilagodimo ali svetujemo posvet z zdravnikom.',
    },
    {
      key: 'profile',
      title: 'Neobvezen zdravstveni profil',
      text: 'Dodatne podatke vpišeš le, če želiš. Brez njih Runko načrtuje bolj previdno.',
    },
    {
      key: 'gdpr',
      title: 'Tvoji podatki so tvoji',
      text: 'Zbiramo le tisto, kar načrt res uporabi, in ravnamo v skladu z GDPR.',
    },
  ],
  note: 'Runko ne nadomešča zdravnika. Če imaš zdravstvene težave ali dvome, se pred začetkom posvetuj z zdravnikom.',
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
    { label: 'Cena', values: ['€ X / mesec', 'Brezplačno', '€ X / mesec'], notes: [null, null, null] },
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
  intro: 'Prvi mesec je brezplačen. Potem izbereš paket, ki ti ustreza.',
  trial: {
    title: '1 mesec brezplačno',
    text: 'Celoten načrt, trener in vpisovanje treningov. Brez obveznosti.',
  },
  tiers: [
    {
      key: 'monthly',
      name: 'Mesečno',
      price: '€ X',
      period: 'na mesec',
      note: 'Prekineš kadar koli.',
      featured: false,
      features: ['Osebni načrt do tekme', 'Trener v klepetu', 'Vpis in pregled treningov'],
    },
    {
      key: 'yearly',
      name: 'Letno',
      price: '€ X',
      period: 'na leto',
      note: 'Za celo sezono tekem.',
      badge: 'Najbolj ugodno',
      featured: true,
      features: ['Vse iz mesečnega paketa', 'Več zaporednih ciljev in tekem', 'Prihranek v primerjavi z mesečnim'],
    },
  ],
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
      a: 'Ne. Dovolj je, da veš, koliko si pretekel in koliko časa si tekel. Napor oceniš po občutku.',
    },
    {
      q: 'Sem popoln začetnik. Je Runko zame?',
      a: 'Da. Začetniki začnejo s hojo in tekom, cilj prvih tednov pa je, da postopno pretečeš 30 minut brez ustavljanja.',
    },
    {
      q: 'Kaj, če izpustim trening?',
      a: 'Nič hudega. Vpišeš, kar si naredil, trener pa prilagodi naslednje dni, tako da ti ničesar ni treba nadoknaditi na silo.',
    },
    {
      q: 'Na katere tekme se lahko pripravim?',
      a: 'Na cestne tekme od 5 km do maratona. Gorskih tekov in ultramaratonov za zdaj ne načrtujemo.',
    },
    {
      q: 'Kako se trener spomni mojih podatkov?',
      a: 'Trener si zapomni pomembne stvari iz vajinih pogovorov, na primer bolečine ali termine. V nastavitvah vidiš, kaj si je zapomnil.',
    },
    {
      q: 'Kaj se zgodi po brezplačnem mesecu?',
      a: 'Izbereš mesečni ali letni paket. Če ne izbereš nobenega, se načrt zaklene, podatki pa ostanejo.',
    },
    {
      q: 'Ali Runko nadomešča zdravnika?',
      a: 'Ne. Runko je pripomoček za načrtovanje treninga. Če imaš zdravstvene težave, se pred začetkom posvetuj z zdravnikom.',
    },
  ],
}

// ---------------------------------------------------------------------------
// 13. Zaključni poziv
// ---------------------------------------------------------------------------
export const finalCta = {
  marquee: ['Tvoj cilj', 'Tvoj tempo', 'Tvoja tekma'],
  title: 'Naslednji tek je lahko prvi v pravem načrtu.',
  text: 'Nastavitev traja nekaj minut. Prvi mesec je brezplačen.',
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
