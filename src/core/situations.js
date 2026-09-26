/**
 * situations.js — the vocabulary a knowledge document's `load_when:` (and a
 * research summary's `situations:`) draws from, and the keyword matching that
 * infers a situation from what the runner wrote.
 *
 * Pure string handling with no bundler dependency, so it is tested under
 * plain node (knowledge.js, which needs Vite, re-exports it).
 */

export const SITUATIONS = [
  'always',
  'chat',
  'plan_generation',
  'onboarding',
  'injury_mention',
  'nutrition_question',
  'pace_question',
  'workout_question',
  'motivation',
  // Research summaries (knowledge/research): topics a runner may raise in chat.
  'injury_return',
  'assessment_question',
  'method_choice',
  'periodization_question',
  'progression_question',
  'recovery_question',
  'missed_sessions',
  'daniels_question',
  'pfitz_question',
  'hansons_question',
  'lydiard_question',
  'norwegian_question',
  'eighty_twenty_question',
  'higdon_question',
  'galloway_question',
  'canova_question',
  'polarized_question',
  'beginner_question',
  'cycle_question',
  'pregnancy_question',
  'masters_question',
  'weight_question',
  'timecrunch_question',
  'teen_question',
  'strength_question',
  'mobility_question',
  'crosstraining_question',
  'sleep_question',
  'heat_question',
  'altitude_question',
  'hills_question',
  'fatigue_question',
]

/**
 * Keywords that infer a situation from what the runner actually wrote.
 * English and Slovenian, because the coach answers in both. Matching is
 * accent- and case-insensitive (see `normalize`), so "bolecina" finds
 * "bolečina" and a runner who types without diacritics is still understood.
 */
export const SITUATION_KEYWORDS = {
  injury_mention: [
    // en
    'pain', 'painful', 'hurt', 'hurts', 'sore', 'soreness', 'injury', 'injured',
    'knee', 'ankle', 'achilles', 'shin', 'splints', 'plantar', 'fascia',
    'it band', 'itb', 'calf', 'hamstring', 'quad', 'hip', 'groin', 'foot',
    'heel', 'strain', 'sprain', 'niggle', 'swollen', 'swelling', 'stress fracture',
    'tendon', 'tendinitis', 'tendinopathy', 'limp',
    // sl
    'bolecina', 'bolecine', 'boli', 'bolece', 'poskodba', 'poskodoval',
    'koleno', 'kolena', 'glezen', 'ahilova', 'golen', 'meca',
    'misica', 'misice', 'stegno', 'stopalo', 'peta', 'kolk', 'dimlje', 'hrbet',
    'oteklina', 'otekel', 'zvin', 'nateg',
  ],
  nutrition_question: [
    // en
    'eat', 'eating', 'ate', 'food', 'diet', 'nutrition', 'fuel', 'fuelling',
    'fueling', 'gel', 'gels', 'carb', 'carbs', 'carbohydrate', 'protein',
    'hydration', 'hydrate', 'water', 'drink', 'drinking', 'electrolyte',
    'breakfast', 'dinner', 'lunch', 'snack', 'caffeine', 'supplement',
    // sl
    'hrana', 'hrano', 'jesti', 'jem', 'pojesti', 'prehrana', 'prehrano',
    'gorivo', 'ogljikovi', 'hidrati', 'beljakovine', 'hidracija', 'piti',
    'voda', 'vodo', 'zajtrk', 'kosilo', 'vecerja', 'elektroliti', 'kofein',
  ],
  pace_question: [
    // en
    'pace', 'paces', 'vdot', 'how fast', 'too fast', 'too slow', 'speed',
    'min/km', 'per km', 'threshold', 'race time', 'personal best', 'pb',
    'splits', 'heart rate', 'hr zone', 'zone 2', 'target time', 'finish time',
    'rpe', 'talk test', 'zones',
    // sl
    'tempo', 'tempu', 'hitrost', 'hitro', 'pocasi', 'pocasneje', 'cas',
    'osebni rekord', 'rekord', 'prag', 'srcni utrip', 'utrip', 'cona',
    'minut na kilometer',
  ],
  workout_question: [
    // en
    'workout', 'session', 'interval', 'intervals', 'rep', 'reps', 'repetition',
    'long run', 'tempo run', 'fartlek', 'track', 'hill', 'hills', 'strides',
    'warm up', 'warm-up', 'cool down', 'cross training', 'easy run',
    'schedule', 'which days', 'rest day',
    // sl
    'trening', 'treningu', 'intervali', 'intervale', 'ponovitve', 'serija',
    'dolgi tek', 'lahkoten tek', 'klanec', 'klanci', 'ogrevanje', 'raztezanje',
    'vaja', 'vaje', 'razpored', 'dan pocitka',
  ],
  motivation: [
    // en
    'motivation', 'motivated', 'unmotivated', 'lazy', 'skipped', 'missed',
    'give up', 'quitting', 'burnt out', 'burned out', 'consistency',
    "can't be bothered", 'no energy', 'demotivated',
    // sl
    'motivacija', 'motivacije', 'volja', 'nimam volje', 'preskocil',
    'izpustil', 'obupal', 'obupujem', 'lenoba', 'utrujen', 'izgorel',
    'vztrajnost',
  ],

  // ---- Research summaries -------------------------------------------------
  injury_return: [
    'return to running', 'back to running', 'come back from injury', 'after injury',
    'walk-run', 'walk run', 'ponovno teci', 'vrnitev po poskodbi', 'po poskodbi',
  ],
  assessment_question: [
    'experience level', 'my level', 'what level', 'am i a beginner', 'par-q', 'screening',
    'can i start', 'moja raven', 'katera raven', 'lahko zacnem',
  ],
  method_choice: [
    'which plan', 'which method', 'which methodology', 'best plan', 'best method', 'training method',
    'katera metoda', 'kateri nacrt', 'najboljsa metoda',
  ],
  periodization_question: [
    'phase', 'phases', 'periodization', 'periodisation', 'base phase', 'build phase',
    'peak phase', 'how many weeks', 'plan length', 'faza', 'faze', 'periodizacija', 'koliko tednov',
  ],
  progression_question: [
    '10 percent', '10%', 'ten percent', 'how much can i increase', 'increase mileage', 'increase volume',
    'add mileage', 'weekly mileage', 'long run length', 'koliko lahko povecam', 'povecanje obsega',
    'kilometrina', 'tedenski obseg',
  ],
  recovery_question: [
    'taper', 'tapering', 'recovery week', 'down week', 'rest week', 'after the race', 'after a race',
    'post-race', 'post race', 'razbremenitev', 'razbremenitveni teden', 'po tekmi', 'okrevanje',
  ],
  missed_sessions: [
    'missed a week', 'missed sessions', 'days off', 'time off', 'took a break', 'was sick', 'been ill',
    'illness', 'fever', 'a break from running', 'izpustil sem', 'pavza', 'bolan sem', 'bolezen',
    'vrocina', 'prehlad',
  ],
  daniels_question: ['daniels', 'vdot', 'daniels formula', 'cruise interval', 'cruise intervals'],
  pfitz_question: ['pfitz', 'pfitzinger', 'medium-long', 'medium long', 'lactate threshold run'],
  hansons_question: ['hansons', 'hanson', 'cumulative fatigue', 'sos workouts'],
  lydiard_question: ['lydiard', 'arthur lydiard', 'conditioning phase', 'hill phase'],
  norwegian_question: [
    'norwegian', 'double threshold', 'sub-threshold', 'subthreshold', 'lactate', 'bakken', 'ingebrigtsen',
    'norveska metoda',
  ],
  eighty_twenty_question: [
    '80/20', '80 20', 'eighty twenty', 'moderate intensity rut', 'too many easy runs', 'zone 2 training',
    'polarised', 'osemdeset dvajset',
  ],
  higdon_question: ['higdon', 'hal higdon', 'novice 1', 'novice 2', 'intermediate 1'],
  galloway_question: [
    'galloway', 'run-walk', 'run walk', 'run/walk', 'magic mile', 'jeff galloway', 'hoja-tek', 'hoja tek',
    'tek in hoja',
  ],
  canova_question: ['canova', 'specific endurance', 'special block', 'percent of race pace'],
  polarized_question: [
    'polarized', 'polarised', 'pyramidal', 'seiler', 'training intensity distribution', 'polarizirano',
  ],
  beginner_question: [
    'couch to 5k', 'couch to 5', 'c25k', 'first run', 'never ran', 'never run', 'start running',
    'starting to run', 'total beginner', 'prvic tecem', 'zacetnik', 'zacenjam s tekom', 'od nic',
  ],
  cycle_question: [
    'my period', 'her period', 'periods', 'menstrual', 'menstruation', 'menstrual cycle', 'cycle day', 'pms', 'amenorrhea', 'amenorrhoea',
    'menstruacija', 'menstruacijo', 'ciklus', 'perioda', 'mesecno perilo',
  ],
  pregnancy_question: [
    'pregnant', 'pregnancy', 'postpartum', 'post-partum', 'after birth', 'after giving birth', 'baby',
    'gave birth', 'give birth', 'giving birth', 'caesarean', 'c-section', 'pelvic floor', 'breastfeeding', 'nosecnost', 'nosecnosti', 'noseca',
    'po porodu', 'porod', 'dojenje', 'carski rez', 'medenicno dno',
  ],
  masters_question: [
    'masters', 'over 40', 'over 50', 'over 60', 'in my 40s', 'in my 50s', 'in my 60s', 'older runner',
    'age-graded', 'stara', 'starejsi', 'starejsa', 'v petdesetih', 'v stiridesetih', 'v sestdesetih',
  ],
  weight_question: [
    'overweight', 'bmi', 'weight loss', 'lose weight', 'heavy runner', 'obese', 'obesity', 'body weight',
    'prevelika teza', 'prekomerna teza', 'zdravljenje teze', 'hujsanje', 'shujsati', 'kilogrami',
  ],
  timecrunch_question: [
    'busy schedule', 'only two days', 'only 2 days', 'only three days', 'only 3 days', 'one day a week',
    'two days a week', 'not enough time', 'time crunched', 'short on time', 'samo dva dni', 'samo dva',
    'malo casa', 'nimam casa',
  ],
  teen_question: [
    'my son', 'my daughter', 'teenager', 'teen', 'school team', 'high school', 'youth runner', 'moj sin',
    'moja hci', 'najstnik', 'najstnica', 'solska ekipa', 'otrok',
  ],
  strength_question: [
    'strength', 'weights', 'gym', 'squat', 'squats', 'deadlift', 'plyometric', 'plyometrics', 'core work',
    'calf raise', 'calf raises', 'krepilna', 'utezi', 'fitnes', 'pocepi',
  ],
  mobility_question: [
    'stretch', 'stretching', 'foam roll', 'foam rolling', 'mobility', 'warm-up routine', 'warm up routine',
    'drills', 'raztezanje', 'raztezati', 'mobilnost', 'ogrevanje', 'vaje za ogrevanje',
  ],
  crosstraining_question: [
    'cross-training', 'cross training', 'cycling', 'swimming', 'pool running', 'aqua jogging', 'elliptical',
    'rowing', 'kolesarjenje', 'plavanje', 'tek v vodi', 'nadomestna vadba',
  ],
  sleep_question: [
    'sleep', 'sleeping', 'nap', 'insomnia', 'tired in the morning', 'spanje', 'spati', 'nespecnost',
    'dremez', 'zaspim',
  ],
  heat_question: [
    'heat', 'hot weather', 'humid', 'humidity', 'wbgt', 'heat index', 'too hot', 'sunny', 'summer running',
    'cold', 'freezing', 'winter running', 'ice', 'icy', 'vroce', 'vrocina', 'vrocino', 'poletje', 'poletni',
    'mraz', 'zima', 'zimski', 'poledica',
  ],
  altitude_question: [
    'altitude', 'high altitude', 'training camp at altitude', 'mountains', 'above 2000', 'visina',
    'nadmorska visina', 'visinske priprave', 'v hribih',
  ],
  hills_question: [
    'hill repeats', 'hill running', 'uphill', 'downhill', 'hill sprints', 'climb', 'climbing', 'vertical',
    'klanec', 'klanci', 'klance', 'klancih', 'hrib', 'hribe', 'hribih', 'navkreber', 'navzdol', 'vzpon', 'vzponi',
  ],
  fatigue_question: [
    'overtraining', 'overtrained', 'overreaching', 'always tired', 'exhausted', 'fatigue', 'fatigued',
    'heavy legs', 'hrv', 'resting heart rate', 'readiness', 'burnout', 'preutrujenost', 'preutrujen',
    'utrujenost', 'utrujena', 'tezke noge', 'miroven utrip',
  ],
}

/** Strip diacritics and case so "bolečina" and "bolecina" both match. */
export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    // \p{M} = every combining mark, i.e. exactly what NFD just split off.
    .replace(/\p{M}/gu, '')
}

/**
 * Keywords are matched at a WORD BOUNDARY but allowed to run on past the end,
 * so "knee" finds "knees" and "bolecina" finds "bolecine" — while "ate" no
 * longer fires on "water" and "rep" no longer fires on "prepare". Compiled
 * once at module load.
 */
const SITUATION_MATCHERS = Object.entries(SITUATION_KEYWORDS).map(([situation, keywords]) => [
  situation,
  keywords.map((k) => new RegExp('\\b' + normalize(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
])

/**
 * Infer situations from free text (the runner's message). Always additive —
 * callers pass the situations they know for certain, this finds the rest.
 * @returns {string[]}
 */
export function detectSituations(text) {
  if (!text) return []
  const haystack = normalize(text)
  const found = []
  for (const [situation, matchers] of SITUATION_MATCHERS) {
    if (matchers.some((re) => re.test(haystack))) found.push(situation)
  }
  return found
}
