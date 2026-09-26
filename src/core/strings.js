/**
 * strings.js — EVERY user-facing string in Runko, in one place.
 *
 * The app speaks Slovenian. Code identifiers, database columns, workout
 * `type` values and log messages stay English; only what a runner reads
 * lives here. Editing copy means editing this file and nothing else.
 *
 * It sits in core because core also produces runner-facing text (AI error
 * messages, phase descriptions, workout titles) and core may not import from
 * the UI layer. This file is pure data — no React, no DOM — so it breaks no
 * rule. See ./README.md.
 *
 * Adding a language later means a sibling file and a picker; nothing else in
 * the app hardcodes copy.
 */

export const t = {
  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------
  common: {
    appTagline: 'Tvoj AI tekaški trener.',
    continue: 'Naprej',
    back: '← Nazaj',
    cancel: 'Prekliči',
    save: 'Shrani',
    delete: 'Izbriši',
    loading: 'Nalagam…',
    thinking: 'Razmišljam…',
    km: 'km',
    min: 'min',
    bpm: 'bpm',
    week: 'teden',
    weeks: 'tednov',
    days: 'dni',
    day: 'dan',
    of: 'od',
    today: 'danes',
    current: 'trenutni',
    optional: 'neobvezno',
    notSet: '—',
  },

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  nav: {
    home: 'Domov',
    plan: 'Načrt',
    coach: 'Trener',
    log: 'Vpiši tek',
    settings: 'Nastavitve',
  },

  // -------------------------------------------------------------------------
  // Auth, signup, password reset
  // -------------------------------------------------------------------------
  auth: {
    login: 'Prijava',
    signup: 'Registracija',
    email: 'E-pošta',
    emailPlaceholder: 'ti@primer.com',
    password: 'Geslo',
    loginButton: 'Prijavi se',
    signupButton: 'Začni brezplačen mesec',
    forgotPassword: 'Pozabljeno geslo?',
    resetCta: 'Ponastavi geslo →',
    trialNote: 'Vključuje 1 mesec brezplačnega preizkusa Runko Premium. Brez kartice.',
    confirmEmail: 'Preveri e-pošto in potrdi račun, nato se prijavi.',
    forgotIntro:
      'Vpiši e-naslov, s katerim si se registriral, in poslali ti bomo povezavo za novo geslo.',
    forgotButton: 'Pošlji povezavo',
    forgotSent: 'Če za ta e-naslov obstaja račun, je povezava na poti. Preveri nabiralnik.',
    backToLogin: '← Nazaj na prijavo',
  },

  reset: {
    title: 'Nastavi novo geslo',
    subtitle: 'Izberi geslo, ki ga tukaj še nisi uporabil.',
    expiredTitle: 'Povezava ne deluje več',
    expiredSubtitle: 'Povezave za ponastavitev so enkratne in veljajo omejen čas.',
    expiredBody:
      'Ta povezava je potekla ali je bila že uporabljena. Vpiši e-naslov in poslali ti bomo novo.',
    linkInvalid: 'Povezava je neveljavna. Zahtevaj novo spodaj.',
    requestNew: 'Pošlji novo povezavo',
    newSent: 'Če za ta e-naslov obstaja račun, je nova povezava na poti. Odpri najnovejše sporočilo.',
    backToLogin: 'Nazaj na prijavo',
    newPassword: 'Novo geslo',
    confirmPassword: 'Ponovi novo geslo',
    submit: 'Shrani novo geslo',
    cancel: 'Prekliči in se odjavi',
    tooShort: (n) => `Uporabi vsaj ${n} znakov.`,
    mismatch: 'Gesli se ne ujemata.',
    samePassword: 'Novo geslo mora biti drugačno od starega.',
    weakPassword: 'Geslo je prešibko. Izberi daljše ali bolj raznoliko geslo.',
    sessionGone: 'Seja za ponastavitev je potekla. Zahtevaj novo povezavo.',
    rateLimited: 'Preveč poskusov. Počakaj nekaj minut in poskusi znova.',
    genericError: 'Gesla ni bilo mogoče shraniti. Poskusi znova.',
    doneTitle: 'Geslo posodobljeno',
    doneBody: 'Prijavljam te…',
  },


  // -------------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------------
  dashboard: {
    greetingEarly: 'Zgodnja ptica',
    greetingMorning: 'Dobro jutro',
    greetingAfternoon: 'Dober dan',
    greetingEvening: 'Dober večer',
    runnerFallback: 'tekač',
    coachSays: 'Trener Runko pravi',
    trialLeft: (n) => `Premium preizkus — še ${n} dni`,
    thisWeek: 'Ta teden',
    trainingPlan: 'Načrt treninga',
    weekOf: (a, b) => `Teden ${a} od ${b}`,
    unlocks: (d) => `🔒 Odklene se ${d}`,
    backToThisWeek: 'Nazaj na ta teden',
    adaptedNote: '📋 Trener je pregledal pretekli teden in prilagodil tega.',
    phaseSuffix: 'faza',
    recoveryWeek: 'Regeneracijski teden',
    targetThisWeek: (km) => `Cilj ta teden: ${km} km`,
    targetThisWeekTime: (min) => `Cilj ta teden: ${min} min teka in hoje`,
    fullPlan: 'Cel načrt',
    emptyWeek: 'Ta teden nima treningov — izberi drug teden ali vpiši tek.',
    noPlanTitle: 'Načrta še ni',
    noPlanBody:
      'Povej trenerju nekaj o svojem teku in sestavil ti bo načrt okoli tvojega cilja, tempa in tedna.',
    createPlan: 'Sestavi mi načrt',
    orLogRun: 'Ali pa samo vpiši tek — to deluje že zdaj',
    recentRuns: 'Zadnji teki',
    missedWorkout: 'Izpuščen trening',
    logSomethingElse: 'Vpiši drug tek',
    planEnded: 'Ta načrt se je iztekel. Sestavi novega, da bodo treningi spet sledili tvojim tekom.',
    loggedOutsidePlan: (d) => `Tek ${d} je shranjen, ni pa del tega tedna v načrtu.`,
    goalChanged: 'Se je cilj spremenil?',
    goalChangedBody:
      'Sestavi nov načrt okoli druge razdalje, datuma ali ciljnega časa. Trener začne znova od tvojih zadnjih tekov.',
    createNewPlan: 'Sestavi nov načrt',
  },

  // -------------------------------------------------------------------------
  // Workout card
  // -------------------------------------------------------------------------
  workout: {
    distance: 'Dolžina',
    time: 'Čas',
    pace: 'Tempo',
    heartRate: 'Utrip',
    details: 'Podrobnosti',
    doneAsPlanned: 'Opravljeno kot načrtovano',
    logging: 'Shranjujem…',
    adjust: 'Prilagodi',
    howTo: 'Kako izvesti',
    why: 'Zakaj ta trening',
    logIt: 'Vpiši',
    lockedHint: 'Odklene se, ko pride ta teden',
    types: {
      easy: 'lahkoten',
      long: 'dolgi',
      tempo: 'tempo',
      interval: 'intervali',
      repetition: 'ponovitve',
      cross: 'druga vadba',
      race: 'tekma',
      rest: 'počitek',
      walk_run: 'hoja-tek',
      walk: 'hitra hoja',
    },
  },

  // -------------------------------------------------------------------------
  // Plan overview
  // -------------------------------------------------------------------------
  plan: {
    title: 'Tvoj načrt',
    summary: (weeks, km) => `${weeks} tednov · ${km} km skupaj`,
    summaryTime: (weeks, hours) => `${weeks} tednov · približno ${hours} ur teka in hoje`,
    rangeNote:
      'Številke so okvirne. Tempo in utrip sta razpona, ne točni cilji — manjša odstopanja so povsem v redu. Teren, veter in počutje vsak dan malo premaknejo.',
    rangeNoteStrong: 'okvirne',
    yourPaces: 'Tvoji trenažni tempi',
    weeklyVolume: 'Tedenski obseg',
    peak: (n, unit = 'km') => `vrh ${n} ${unit}`,
    recoveryWeekLegend: 'Regeneracijski teden',
    recoveryShort: 'Regeneracija',
    weekTooltip: (n, v, rec, unit = 'km') => `Teden ${n}: ${v} ${unit}${rec ? ' (regeneracija)' : ''}`,
    weekByWeek: 'Teden za tednom',
    noPlan: 'Načrta še ni.',
    howBuilt: 'Kako je nastal ta načrt',
    howBuiltBody:
      'Obseg raste za največ 10 % na teden, vsak 4. teden se zmanjša na približno 70 %, da trening zaleže, in približno 80 % teka je lahkotnega. Faze:',
    phases: {
      base: 'Osnova',
      build: 'Nadgradnja',
      sharpen: 'Ostrenje',
      taper: 'Razbremenitev',
      walk_run: 'Hoja-tek',
      walk: 'Hoja',
      return: 'Vrnitev',
      consistency: 'Rednost',
      maintain: 'Ohranjanje',
      foundation: 'Predpriprava',
    },
    scenarioLabel: 'Vrsta načrta',
    verdictLabel: 'Ocena cilja',
    originalGoal: 'Tvoj prvotni cilj',
    builtFor: 'Načrt je zgrajen za',
    otherOption: 'Druga možnost',
    fallbackLabel: 'Rezervni cilj',
  },

  // -------------------------------------------------------------------------
  // Coach chat
  // -------------------------------------------------------------------------
  chat: {
    title: 'Trener Runko',
    online: '● na voljo',
    placeholder: 'Vprašaj trenerja…',
    send: 'Pošlji',
    loadEarlier: 'Naloži starejša sporočila',
    loading: 'Nalagam…',
    clear: 'Počisti pogovor',
    greeting: (name) =>
      `Živjo${name ? ', ' + name : ''}! Sem tvoj trener. Vprašaj me karkoli o treningu, tempu, regeneraciji ali pripravi na tekmo. 🔥`,
    suggestions: [
      'Kako naj razporedim tempo na dolgem teku?',
      'Noge so težke — naj vseeno tečem?',
      'Kaj naj pojem pred jutranjim tekom?',
    ],
    clearTitle: 'Počistim pogovor?',
    clearBody: 'To izbriše vsa sporočila med tabo in trenerjem. Dejanja ni mogoče razveljaviti.',
    clearKeepsMemoryStrong: 'Kar si trener zapomni o tebi, ostane.',
    clearKeepsMemory:
      'Tvoje poškodbe, urnik in preference ostanejo nespremenjeni — lahko jih kadarkoli pregledaš ali izbrišeš v nastavitvah.',
    clearConfirm: 'Počisti pogovor',
    clearing: 'Čistim…',
  },

  // -------------------------------------------------------------------------
  // Logging a run
  // -------------------------------------------------------------------------
  log: {
    title: 'Vpiši tek',
    subtitle: 'Kako je šlo?',
    distance: 'Razdalja (km)',
    duration: 'Čas (min)',
    effort: 'Kako naporno je bilo?',
    notes: 'Zapiski (neobvezno)',
    notesPlaceholder: 'Kako so se počutile noge, vreme, teren…',
    missed: 'Tega treninga nisem opravil',
    submit: 'Shrani tek',
    date: 'Datum',
    futureDate: 'Teka v prihodnosti ni mogoče vpisati. Izberi današnji ali pretekli dan.',
    invalidDate: 'Neveljaven datum.',
    invalidNumbers: 'Razdalja in čas morata biti veljavni številki.',
    fromPlan: 'Iz načrta',
    manualTitle: 'Vpiši tek',
    saving: 'Shranjujem…',
    doneTitle: 'Tek shranjen!',
    adapted: '📋 Trener je to opazil in prilagodil naslednji teden.',
    backToDashboard: 'Nazaj na pregled',
    fallbackReaction: 'Tek shranjen. Kar tako naprej! 💪',
    fallbackMissed: 'Zabeleženo. En izpuščen tek še nikogar ni ustavil — prilagodimo in gremo naprej.',
    efforts: [
      { v: 1, label: 'Zelo lahko', emoji: '😌' },
      { v: 2, label: 'Lahko', emoji: '🙂' },
      { v: 3, label: 'Zmerno', emoji: '😅' },
      { v: 4, label: 'Naporno', emoji: '🥵' },
      { v: 5, label: 'Na polno', emoji: '💀' },
    ],
  },

  // -------------------------------------------------------------------------
  // Onboarding
  // -------------------------------------------------------------------------
  onboarding: {
    welcome: 'Dobrodošel v Runko 👋',
    pathQuestion: 'Koliko časa imaš zdaj?',
    thoroughTitle: 'Temeljita priprava',
    thoroughBadge: 'Priporočeno',
    thoroughDesc:
      '~5 min. Deli svoje zadnje teke — načrt ti ustreza od prvega dne.',
    quickTitle: 'Hitra priprava',
    quickDesc: '~1 min. Samo osnove — trenerju lahko poveš več kasneje.',

    nameTitle: 'Najprej osnovno',
    nameQuestion: 'Kako naj te trener kliče?',
    namePlaceholder: 'Tvoje ime',

    bodyTitle: (name) => `O tebi, ${name}`,
    bodySubtitle: 'Pomaga trenerju oceniti obremenitev.',
    age: 'Starost',
    weight: 'Teža (kg)',

    levelTitle: 'Kje si zdaj?',
    levelSubtitle: 'To določa intenzivnost načrta.',
    levels: [
      { id: 'beginner', title: 'Začetnik', desc: 'Nov v teku ali se vračaš po daljšem premoru' },
      { id: 'intermediate', title: 'Srednje', desc: 'Redno tečeš, 5-10 km ti ne dela težav' },
      { id: 'advanced', title: 'Napredno', desc: 'Strukturiran trening, izkušnje s tekmami' },
    ],

    goalTitle: 'Za kaj treniraš?',
    goalSubtitle: 'Izberi razdaljo — katerokoli. Gumbi so samo bližnjice.',
    targetDistance: 'Ciljna razdalja',
    distancePlaceholder: 'ali vpiši poljubno razdaljo, npr. 15',
    when: 'Kdaj?',
    onADate: 'Na določen datum',
    noDate: 'Brez datuma, samo trening',
    targetTime: 'Ciljni čas (neobvezno)',
    targetTimeHint: 'Pusti prazno, če želiš samo priteči do cilja.',
    hours: 'ur',
    minutes: 'min',
    seconds: 's',
    requiredPace: (pace) => `To je ${pace}/km.`,
    paceTooFast: (pace) =>
      `Hm, ${pace}/km je hitreje od svetovnih rekorderjev. Preveri, prosim, ali so ure in minute v pravih poljih.`,
    paceTooSlow: (pace) =>
      `${pace}/km je bolj hoja kot tek. Preveri, prosim, ali si čas vpisal/a prav — če je, je čisto v redu.`,
    pickDistanceFirst: 'Najprej izberi ciljno razdaljo.',

    experienceTitle: 'Od kod začenjaš?',
    experienceSubtitle: 'To določi začetni obseg, da ti prvi teden ustreza.',
    howLongRunning: 'Kako dolgo že tečeš?',
    select: 'Izberi…',
    weeklyVolume: 'Običajen tedenski obseg',
    longestRun: 'Najdaljši nedavni tek',
    experienceHint: 'Nisi prepričan? Pusti prazno — trener bo ocenil iz tvojih tekov.',
    experienceOptions: [
      { months: 0, label: 'Še nikoli nisem tekel/a' },
      { months: 2, label: 'Šele začenjam (manj kot 3 mesece)' },
      { months: 6, label: '3-12 mesecev' },
      { months: 24, label: '1-3 leta' },
      { months: 60, label: '3-10 let' },
      { months: 144, label: 'Več kot 10 let' },
    ],

    daysTitle: 'Kdaj lahko tečeš?',
    daysSubtitle: 'Načrt ti bo dal treninge samo na dneve, ki ti ustrezajo.',
    daysPerWeek: 'Dni na teden',
    whichDays: 'Kateri dnevi? (neobvezno)',
    noDaysPicked: 'Pusti vse izklopljene in trener izbere dneve.',
    daysAvailable: (n) => `${n} dni na voljo.`,
    daysConflict: (picked, wanted) =>
      `Izbral si ${picked} ${picked === 1 ? 'dan' : 'dni'}, želiš pa ${wanted} tekov na teden — trener bo uporabil ${picked}.`,
    weekdays: ['Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob', 'Ned'],

    runBeforeTitle: 'Si že tekel?',
    runBeforeSubtitle:
      'Pravi teki povedo več kot katerikoli vprašalnik — pokažejo, kaj zmoreš danes.',
    yesRegularly: 'Da, redno ali občasno',
    yesDesc: 'Vpisal boš 3 nedavne teke.',
    noBrandNew: 'Ne, čisto na začetku sem',
    noDesc: 'Trener ti bo dal preprost testni tek.',

    runsTitle: 'Tvoji 3 zadnji teki',
    runsSubtitle: 'Približne številke so povsem v redu — trener po njih umeri načrt.',
    runLabel: (i) => `Tek ${i}`,
    remove: 'Odstrani',
    distanceKm: 'Razdalja (km)',
    timeMin: 'Čas (min)',
    date: 'Datum',
    effort: 'Napor',
    avgHr: 'Povpr. utrip (neobvezno)',
    addRun: '+ Dodaj še en tek',

    testRunTitle: 'Tvoja prva naloga 🏃',
    coachSays: 'Trener Runko pravi',
    testRunBody:
      'Preteci 3 km v pogovornem tempu — ves čas bi moral biti sposoben govoriti v celih stavkih. Hoja vmes je popolnoma v redu. Nato se vrni in ga vpiši spodaj.',
    logTestRun: 'Vpiši testni tek',
    howHard: 'Kako naporno je bilo?',
    skipTestRun: 'Testni tek naredim kasneje — preskoči za zdaj',

    notesTitle: 'Še kaj?',
    notesSubtitle:
      'Povej trenerju karkoli pomembnega — poškodbe, urnik, pretekle tekme, kako rad treniraš.',
    notesPlaceholder:
      'npr. Koleno nagaja, če tečem dva dneva zapored. Tečem lahko samo zjutraj. Lani 5 km v 25:30…',
    buildMyPlan: 'Sestavi mi načrt',

    // Safety questions: only what the plan engine needs to keep you safe.
    safetyTitle: 'Varnost na prvem mestu',
    safetyConsent:
      'Ta vprašanja so o zdravju. Odgovore uporabimo samo za to, da je tvoj načrt varen — ne pošiljamo jih AI trenerju ' +
      'in jih ne delimo z nikomer. Spremeniš jih ob novem načrtu, izbrišeš pa kadar koli v Nastavitvah › Zdravstveni profil.',
    pregnancyQuestion: 'Si noseča ali si v zadnjem letu rodila?',
    pregnancyOptions: [
      { value: 'none', label: 'Ne' },
      { value: 'pregnant', label: 'Noseča sem' },
      { value: 'postpartum', label: 'Rodila sem' },
    ],
    weeksPostpartum: 'Koliko tednov je od poroda?',
    painQuestion: 'Te kaj boli v mirovanju ali pri hoji?',
    injuryQuestion: 'Si imel(a) v zadnjih 12 mesecih tekaško poškodbo?',
    breakQuestion: 'Kdaj si nazadnje redno tekel(a)?',
    breakOptions: [
      { value: '0', label: 'Tečem redno' },
      { value: '5', label: 'Pred manj kot tednom' },
      { value: '28', label: 'Pred 1–4 tedni' },
      { value: '56', label: 'Pred 1–2 mesecema' },
      { value: '90', label: 'Pred več kot 2 mesecema' },
      { value: 'never', label: 'Še nikoli nisem tekel(a)' },
    ],
    yes: 'Da',
    no: 'Ne',
    blockedBack: 'Popravi odgovore',
    blockedToApp: 'V aplikacijo',
    clarifyTitle: 'Še nekaj vprašanj',
    clarifySubtitle: 'Brez teh odgovorov bi moral trener ugibati — in ugibanje tu pomeni napačen načrt.',
    clarifyContinue: 'Naprej',
    changeGoal: 'Spremeni cilj',
    verdictTitle: 'Trenerjeva ocena tvojega cilja',
    chooseGoal: 'Izberi, za kaj naj sestavim načrt:',

    building: 'Runko sestavlja tvoj načrt…',
    saving: 'Shranjujem, kar si povedal…',
    skipForNow: 'Preskoči za zdaj',
    notNow: 'Ne zdaj — nazaj v aplikacijo',
  },

  // -------------------------------------------------------------------------
  // Planning pipeline — scenarios, verdicts, follow-up questions, plan intro
  // -------------------------------------------------------------------------
  planning: {
    scenarios: {
      complete_beginner: 'Popoln začetnik',
      beginner_with_deadline: 'Začetnik z rokom',
      recreational: 'Rekreativni tek',
      short_race: 'Kratka tekma',
      long_race: 'Dolga tekma',
      returning: 'Vrnitev k teku',
      maintenance: 'Ohranjanje forme',
    },
    verdicts: { feasible: 'Izvedljivo', stretch: 'Izziv', unsafe: 'Ni varno' },

    questions: {
      event_date: {
        text: 'Datum tvoje tekme je že mimo. Kako naj sestavim načrt?',
        why: 'Brez veljavnega datuma ne vem, kdaj naj bo forma na vrhuncu.',
        options: [{ value: 'no_date', label: 'Treniraj za razdaljo, brez datuma' }],
      },
      current_volume: {
        text: 'Koliko trenutno pretečeš na teden?',
        why: 'Od tega je odvisno, kje načrt začne — prehiter začetek je najpogostejši vzrok poškodb.',
        options: [
          { value: '0', label: 'Trenutno ne tečem' },
          { value: '5', label: 'Do 5 km' },
          { value: '15', label: 'Okoli 15 km' },
          { value: '30', label: 'Okoli 30 km' },
          { value: '50', label: '50 km ali več' },
        ],
      },
      returning: {
        text: 'Se vračaš k teku po premoru ali poškodbi?',
        why: 'Vrnitev zahteva drugačen, previdnejši začetek kot redni trening.',
        options: [
          { value: 'no', label: 'Ne, tečem redno' },
          { value: 'break', label: 'Da, po daljšem premoru' },
          { value: 'injury', label: 'Da, po poškodbi (zdaj brez bolečin)' },
        ],
      },
      longest_run: {
        text: 'Kako dolg je bil tvoj najdaljši tek v zadnjem mesecu?',
        why: 'Dolgi tek mora rasti postopoma od tega, kar zmoreš zdaj.',
        options: [
          { value: '3', label: 'Do 3 km' },
          { value: '5', label: 'Okoli 5 km' },
          { value: '8', label: 'Okoli 8 km' },
          { value: '12', label: 'Okoli 12 km' },
          { value: '16', label: 'Okoli 16 km' },
          { value: '21', label: '20 km ali več' },
        ],
      },
      intent: {
        text: 'V dobri formi si. Kaj želiš v naslednjih tednih?',
        why: 'Ohranjanje in nadgradnja sta dva različna načrta.',
        options: [
          { value: 'maintain', label: 'Ohraniti formo' },
          { value: 'build', label: 'Postopoma jo nadgraditi' },
        ],
      },
    },

    assumptions: {
      event_date: 'Datum tekme je bil v preteklosti, zato načrt ni vezan na datum.',
      current_volume: 'Trenutni obseg ni znan, zato načrt začne previdno pri približno 5 km na teden.',
      returning: 'Ni jasno, ali se vračaš po premoru, zato načrt začne previdno, kot vrnitev.',
      longest_run: 'Najdaljši tek ni jasen, zato je upoštevana previdnejša ocena.',
      intent: 'Cilj ni znan, zato načrt ohranja trenutno formo.',
    },

    priorities: {
      complete_beginner: [
        'rednost pred hitrostjo',
        'hoja-tek po minutah, ne po kilometrih',
        'brez trdih treningov',
        'dan počitka med vsakim tekom',
      ],
      beginner_with_deadline: [
        'varno priti do cilja — tempo ni pomemben',
        'hoja med tekmo je dovoljena in pametna',
        'brez hitrostnih treningov',
        'previden, postopen porast',
      ],
      recreational: [
        'rednost',
        'večinoma lahkoten tek',
        'raznolikost po želji (kratki pospeški)',
        'počasen porast do stabilne ravni',
      ],
      short_race: [
        'hitrost: intervali in kratke ponovitve',
        'pragovni tempo',
        'krajši dolgi teki',
        'razbremenitev pred tekmo',
      ],
      long_race: [
        'dolgi tek kot temelj',
        'postopna rast obsega',
        'faze: osnova, nadgradnja, ostrenje, razbremenitev',
        'tempo tekme v zadnjem delu',
      ],
      returning: [
        'začetek precej pod prejšnjo ravnjo',
        'previden porast',
        'prvih 6 tednov brez intenzivnih treningov',
        'bolečina pomeni korak nazaj, ne naprej',
      ],
      maintenance: [
        'stabilen obseg, brez nadgradnje',
        'en do dva kakovostna treninga na teden',
        'lažji teden vsak 3. ali 4. teden',
      ],
    },

    goal: (km, date, walkBreaks) => {
      if (!km) return 'rednost in splošno kondicijo'
      const d = String(km).replace('.', ',')
      const base = date ? `${d} km dne ${date}` : `${d} km`
      return walkBreaks ? `${base} (s hojo po potrebi)` : base
    },
    time: (minutes) => {
      const total = Math.round(minutes * 60)
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
    },

    // Built-in intro, used whenever the AI does not write one.
    intro: {
      opening: (scenario, weeks) => `${scenario} — ${weeks}-tedenski načrt.`,
      feasible: 'Cilj je v razpoložljivem času dosegljiv brez bližnjic.',
      stretch: (fallback) =>
        `Cilj je izziv: dosegljiv je, a brez rezerve. Če bo šlo težje, je povsem dober rezervni cilj ${fallback}.`,
      unsafe: (original, adopted) =>
        `Tvoj prvotni cilj (${original}) v tem času ni varen — srce in pljuča bi zmogla, kite in kosti pa potrebujejo več časa. ` +
        `Zato je načrt zgrajen za ${adopted}.`,
      otherOption: (option) => `Druga varna možnost: ${option}.`,
      priorities: (list) => `Načrt daje prednost temu: ${list.join(', ')}.`,
      noGoal: 'Brez tekme in brez ciljne razdalje — gradiva rednost in veselje do teka.',
      walkOnly: 'To je načrt hitre hoje brez teka: hodiš 3–5-krat na teden, dolžina sprehodov pa se počasi povečuje do 45–60 minut.',
      walkBase: (weeks) => `Pred prvimi tekaškimi koraki je ${weeks} tednov hitre hoje (pogovorni tempo), da se kite in sklepi navadijo obremenitve.`,
      timeThenDistance: (week) =>
        `Začneš s hojo-tekom po minutah. Ko zmoreš približno 30 minut teka brez premora (predvidoma v ${week - 1}. tednu), načrt preide na kilometre in te postopno pripelje do tekme.`,
      foundation: (weeks, block) =>
        `Do tekme je še daleč, zato prvih ${weeks} tednov ohranjaš stabilen, varen obseg (predpriprava), zadnjih ${block} tednov pa so ciljne priprave, ki se končajo na dan tekme.`,
    },
    fallback: {
      time: (time) => `čas ${time}`,
      walk_breaks: (km) => `priti do cilja na ${String(km).replace('.', ',')} km s hojo po potrebi`,
      finish: (km) => `udobno priti do cilja na ${String(km).replace('.', ',')} km, brez ciljnega časa`,
    },
    // Safety gate (core/planning/gate.js): when Runko builds no plan, and why.
    gate: {
      title: 'Načrta zaenkrat ne sestavim',
      under15:
        'Runko je zaenkrat na voljo od 15. leta naprej, zato ti načrta še ne morem sestaviti. ' +
        'Do takrat je za tek najboljša igra, šport s prijatelji in tekaški klub za mlade, kjer te vodi trener. ' +
        'Veseli bomo, ko se vrneš.',
      pregnant:
        'Iskrene čestitke! V nosečnosti Runko ne sestavlja tekaških načrtov: kaj je varno, je odvisno od tvojega zdravja ' +
        'in poteka nosečnosti, tega pa aplikacija ne more zanesljivo oceniti. O gibanju se posvetuj s svojim ginekologom, ' +
        'osebnim zdravnikom ali babico — povedali ti bodo, kaj je zate primerno. Ko boš po porodu pripravljena, ti Runko ' +
        'pomaga pri postopni vrnitvi k teku.',
      postpartumEarly:
        'V prvih šestih tednih po porodu je tek še prezgoden: telo, zlasti medenično dno, potrebuje čas, da se zaceli. ' +
        'Zdaj so pravi izbor sprehodi in vaje za medenično dno. Po poporodnem pregledu pri zdravniku ali babici se vrni — ' +
        'Runko ti pripravi postopno vrnitev k teku, praviloma od 12. tedna po porodu naprej.',
      postpartumNotCleared: (weeksLeft) =>
        'Med 6. in 12. tednom po porodu je tek smiseln le, če ti ga odobri zdravnik ali babica in so opravljeni testi ' +
        'obremenitve (na primer pri fizioterapevtu za medenično dno). Če to dovoljenje imaš, ga označi v Nastavitvah › ' +
        `Zdravstveni profil. Sicer se vrni čez ${weeksLeft} ${weeksLeft === 1 ? 'teden' : weeksLeft === 2 ? 'tedna' : weeksLeft <= 4 ? 'tedne' : 'tednov'} — ` +
        'do takrat pa sprehodi in vaje za medenično dno.',
      painAtRest:
        'Bolečina v mirovanju ali pri hoji pomeni, da tek zdaj ni varen — najprej jo mora pogledati strokovnjak. ' +
        'Obišči osebnega zdravnika ali fizioterapevta. Ko pri hoji ne bo več bolelo, ti Runko pripravi previdno vrnitev k teku.',
      cardiacSymptoms:
        'Bolečina ali pritisk v prsih, omotica ali omedlevica, nenavadna zadihanost ali razbijanje srca med naporom so znaki, ' +
        'ki jih mora pred začetkom treninga pregledati zdravnik. Obišči osebnega zdravnika; ob bolečini v prsih, ki v ' +
        'mirovanju traja več kot 5 minut, pokliči 112. Ko ti zdravnik tek odobri, to označi v Zdravstvenem profilu in ' +
        'Runko ti sestavi načrt.',
      knownConditionInactive:
        'Z boleznijo srca, sladkorno boleznijo ali boleznijo ledvic je pred začetkom vadbe potreben posvet z zdravnikom — ' +
        'tako bo začetek varen in prilagojen tebi. Ko ti zdravnik vadbo odobri, to označi v Zdravstvenem profilu in ' +
        'Runko ti sestavi načrt.',
      bmi40:
        'Pri tvoji telesni teži je tek za sklepe in kite zaenkrat prevelika obremenitev, zato je to načrt hoje, ne teka. ' +
        'Posvetuj se z osebnim zdravnikom; ko boš 45–60 minut hodil(a) brez bolečin in ti zdravnik tek odobri (označi to ' +
        'v Zdravstvenem profilu), ti Runko pripravi postopen prehod na hojo-tek. Hojo lahko dopolniš s kolesarjenjem, ' +
        'plavanjem ali tekom v vodi.',
      knownConditionActive:
        'Zaradi znane bolezni načrt ne vsebuje trdih treningov, dokler ti jih zdravnik ne odobri (označi v Zdravstvenem profilu).',
      bmi35: 'Pred začetkom teka priporočamo pregled pri osebnem zdravniku. Načrt je previden, s hojo kot delom treninga.',
      ultraLimited:
        'Ultramaratoni in trail so v Runku zaenkrat omejeno podprti: načrt je zgrajen po pravilih za cestne teke, brez ' +
        'posebnosti vzponov, spustov in zelo dolgih tekov.',
    },
    alternative: {
      shorter: (goal) => goal,
      later: (goal) => goal,
      more_days: (goal, days) => `${goal}, če lahko tečeš vsaj ${days}-krat na teden`,
      no_event: 'najprej začetni program hoje-teka, tekma pa ob naslednji priložnosti',
    },
  },

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  settings: {
    title: 'Nastavitve',
    profile: 'Profil',
    name: 'Ime',
    email: 'E-pošta',
    age: 'Starost',
    weight: 'Teža',
    level: 'Raven',
    goal: 'Cilj',
    maxHr: 'Ocenjen maks. utrip',
    levels: { beginner: 'Začetnik', intermediate: 'Srednje', advanced: 'Napredno' },

    memoryTitle: 'Kaj si trener zapomni',
    memoryBody:
      'Pobrano iz vaših pogovorov, da ti ni treba dvakrat razlagati iste stvari. Izbriši, kar ne drži več.',
    memoryEmpty: 'Zaenkrat nič — pogovori se s trenerjem in tu se bo pojavilo, kar je vredno.',
    forget: 'Pozabi to',
    memoryCategories: {
      injury: 'poškodba',
      schedule: 'urnik',
      preference: 'preference',
      life_context: 'življenje',
      goal_change: 'sprememba cilja',
    },

    health: {
      title: 'Zdravstveni profil',
      body: 'Neobvezno. Pomaga, da je načrt varen in prilagojen tebi — npr. srčni utrip za ženske, previdnejši začetek ali vrnitev po porodu.',
      consent:
        'Podatki o zdravju so posebna vrsta osebnih podatkov. Če nadaljuješ, se strinjaš, da jih Runko shrani in uporabi ' +
        'izključno za sestavo tvojega načrta. Ne pošiljamo jih AI trenerju in jih ne delimo z nikomer. Vsako vprašanje je ' +
        'neobvezno, privolitev pa lahko kadar koli prekličeš z izbrisom podatkov spodaj.',
      accept: 'Strinjam se — izpolni profil',
      optionalHint: 'Vsa polja so neobvezna. Kjer odgovora ni, načrt izbere previdnejšo možnost.',
      sex: 'Spol',
      sexOptions: [
        { value: 'female', label: 'Ženska' },
        { value: 'male', label: 'Moški' },
      ],
      height: 'Višina',
      cardiac:
        'Imaš med naporom bolečino ali pritisk v prsih, omotico ali omedlevico, nenavadno zadihanost ali razbijanje srca?',
      condition: 'Imaš znano bolezen srca, sladkorno bolezen ali bolezen ledvic?',
      clearance: 'Ti je zdravnik potrdil, da smeš teči in trenirati?',
      caesarean: 'Je bil porod s carskim rezom?',
      postpartumCleared:
        'Ti je zdravnik ali babica po porodu odobril(a) tek in so opravljeni testi obremenitve (npr. pri fizioterapevtu)?',
      marathons: 'Koliko maratonov si že pretekel(a)?',
      save: 'Shrani',
      saved: 'Shranjeno. Upoštevano bo pri naslednjem načrtu.',
      deleteAll: 'Izbriši vse zdravstvene podatke (tudi varnostne odgovore)',
      deleted: 'Zdravstveni podatki so izbrisani.',
    },

    planTitle: 'Načrt treninga',
    planBody:
      'Se je cilj spremenil ali se vračaš po premoru? Sestavi načrt na novo — trener začne od tvojih zadnjih tekov.',
    createNewPlan: 'Sestavi nov načrt',

    subscription: 'Naročnina',
    premiumActive: 'aktivna',
    trial: 'Preizkus',
    trialDaysLeft: (n) => `Še ${n} dni`,
    subscribeEarly: 'Naroči se že zdaj — kmalu',
    trialEnded:
      'Preizkus se je iztekel. Na brezplačnem paketu si: ročno vpisovanje in trenutni načrt.',
    upgrade: 'Nadgradi na Premium',


    signOut: 'Odjava',
    version: 'Runko v0.1.0 — tekaj z veseljem 🧡',
  },

  // -------------------------------------------------------------------------
  // Paywall
  // -------------------------------------------------------------------------
  paywall: {
    title: 'Tvoj brezplačni preizkus se je iztekel',
    body: (feature, plan) => `${feature} je del paketa ${plan}. Obdrži trenerja ob sebi.`,
    featureChat: 'AI trener',
    featureDefault: 'Ta funkcija',
    subscribe: 'Naroči se — kmalu',
    freeNote: 'Na brezplačnem paketu obdržiš ročno vpisovanje in trenutni načrt.',
    // Shown where a premium feature is quietly absent, so the free tier reads
    // as a deliberate tier rather than as something that failed.
    ended: 'Preizkus se je iztekel — poglej Premium',
    thoughtOfDay: 'Misel dneva',
    dashboardLocked: 'Dnevno sporočilo trenerja je del paketa Premium.',
    logLocked: 'Odziv trenerja in samodejno prilagajanje načrta sta del paketa Premium.',
    planLocked:
      'Načrt je izračunan posebej zate, opisi tednov pa so standardni. S Premium jih napiše trener.',
  },

  // -------------------------------------------------------------------------
  // Errors and system messages
  // -------------------------------------------------------------------------
  errors: {
    aiQuota:
      'Trener lovi sapo — storitev je dosegla omejitev zahtev. Počakaj minuto in poskusi znova. 🙏',
    aiGeneric: 'Trenerja trenutno ni bilo mogoče doseči. Preveri povezavo in poskusi čez trenutek.',
    aiSignedOut: 'Za pogovor s trenerjem se je treba prijaviti.',
    // Fallback only: the proxy's own 402 message is shown when it arrives.
    aiNotPremium: 'Tvoj brezplačni preizkus se je iztekel. AI trener je del paketa Premium.',
    supabaseMissing:
      'Supabase ni nastavljen — kopiraj .env.example v .env in vpiši svoje ključe, nato znova zaženi strežnik.',
    sessionInvalid:
      'Tvoja seja ni več veljavna. Odjavi se, znova prijavi in poskusi še enkrat.',
    generic: 'Nekaj je šlo narobe. Poskusi znova.',
    duplicate: 'Ta zapis že obstaja.',
    invalidValue: 'Ena od vrednosti ni veljavna. Preveri vnos.',
    notAllowed: 'Za to dejanje nimaš dovoljenja.',
    network: 'Ni povezave s strežnikom. Preveri internet in poskusi znova.',
    linkFailed:
      'Profila ni bilo mogoče povezati z računom (registracija se še ni ustalila). Odjavi se, znova prijavi in dokončaj uvod.',
  },

  // -------------------------------------------------------------------------
  // Subscription plan copy
  // -------------------------------------------------------------------------
  subscription: {
    planName: 'Runko Premium',
    price: '7,99 € / mesec',
    features: [
      'Neomejen pogovor z AI trenerjem',
      'Osebni tedenski načrti treninga',
      'Samodejno prilagajanje načrta',
      'Prednostni dostop do integracij',
    ],
    checkoutComingSoon:
      'Plačila so skoraj pripravljena! Stripe blagajna bo omogočena v eni prihodnjih posodobitev.',
  },
}

export default t
