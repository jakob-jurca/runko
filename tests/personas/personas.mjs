/**
 * Synthetic runners. Each one is a realistic person the plan engine must
 * handle, plus the properties ANY good coach's plan for them would have.
 *
 * The expectations are coaching judgements written down before the engine
 * was rebuilt — they describe what the plan must look like, not what some
 * version of the code happens to produce. See properties.mjs for how each
 * one is checked; no AI call is involved anywhere.
 *
 * Dates are relative to a fixed Monday so the suite is deterministic.
 */

export const TODAY = new Date('2026-09-21T09:00:00') // a Monday

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The Sunday `weeks` weeks from TODAY's week (1 = this coming Sunday). */
export function sundayIn(weeks) {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + 6 + (weeks - 1) * 7)
  return iso(d)
}

/** A date `days` before TODAY, for logged runs. */
export function daysAgo(days) {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - days)
  return iso(d)
}

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * profile: exactly the users-row fields onboarding collects.
 * runs:    logged runs (the workouts table / intake runs).
 * memories: coach_memory rows.
 * answers: replies to the clarify questions, when the persona needs any.
 * expect:  the properties a good plan must have (see properties.mjs).
 */
export const PERSONAS = [
  // ---------------------------------------------------------------- beginners
  {
    id: 'mother-never-ran-5k',
    who: '35-year-old mother, never ran, wants to run 5 km comfortably, 3 days a week',
    profile: {
      age: 35, fitness_level: 'beginner', experience_months: 0, weekly_volume_km: 0,
      target_distance_km: 5, days_per_week: 3,
      available_days: ['Monday', 'Wednesday', 'Saturday'],
      coach_notes: 'Mama dveh otrok, še nikoli nisem tekla. Rada bi udobno pretekla 5 km.',
    },
    expect: {
      scenario: 'complete_beginner', verdict: 'feasible',
      walkRun: true, timeBased: true, noHardSessions: true, noBackToBack: true,
      maxWeeklyIncreasePct: 10, maxRunDays: 3,
    },
  },
  {
    id: 'student-zero-half-5w',
    who: '20-year-old student, zero experience, half marathon in 5 weeks',
    profile: {
      age: 20, fitness_level: 'beginner', experience_months: 0, weekly_volume_km: 0,
      target_distance_km: 21.1, event_date: sundayIn(5), days_per_week: 4,
    },
    expect: {
      scenario: 'beginner_with_deadline', verdict: 'unsafe',
      proposesSaferGoal: true, originalGoalNotBuilt: true,
      noHardSessions: true, walkRun: true, maxLongRunKm: 8, maxWeeklyIncreasePct: 10,
    },
  },
  {
    id: 'senior-walks-daily',
    who: '60-year-old who walks daily and wants to start jogging',
    profile: {
      age: 60, fitness_level: 'beginner', experience_months: 0, weekly_volume_km: 0,
      days_per_week: 3,
      coach_notes: 'Vsak dan hodim po eno uro. Rad bi začel počasi teči.',
    },
    expect: {
      scenario: 'complete_beginner', verdict: 'feasible',
      walkRun: true, timeBased: true, noHardSessions: true, noBackToBack: true,
      gentleStart: true, maxWeeklyIncreasePct: 10,
    },
  },
  {
    id: 'zero-to-5k-race-in-4w',
    who: 'Never ran, signed up for a 5 km fun run in 4 weeks',
    profile: {
      age: 29, fitness_level: 'beginner', experience_months: 0, weekly_volume_km: 0,
      target_distance_km: 5, event_date: sundayIn(4), days_per_week: 3,
    },
    expect: {
      scenario: 'beginner_with_deadline', verdict: 'stretch',
      hasFallbackTarget: true, walkRun: true, noHardSessions: true,
      raceWalkBreaks: true, maxWeeklyIncreasePct: 10,
    },
  },
  {
    id: 'novice-10k-in-8w',
    who: '4 months of running, 8 km a week, 10 km race in 8 weeks',
    profile: {
      age: 31, fitness_level: 'beginner', experience_months: 4, weekly_volume_km: 8,
      longest_run_km: 4, target_distance_km: 10, event_date: sundayIn(8), days_per_week: 3,
    },
    expect: {
      scenario: 'beginner_with_deadline', verdict: 'stretch',
      hasFallbackTarget: true, noHardSessions: true, raceWalkBreaks: true,
      maxWeeklyIncreasePct: 10, maxLongRunKm: 9,
    },
  },
  {
    id: 'zero-marathon-16w',
    who: 'Never ran, wants a marathon in 16 weeks',
    profile: {
      age: 38, fitness_level: 'beginner', experience_months: 0, weekly_volume_km: 0,
      target_distance_km: 42.2, event_date: sundayIn(16), days_per_week: 4,
    },
    expect: {
      scenario: 'beginner_with_deadline', verdict: 'unsafe',
      proposesSaferGoal: true, originalGoalNotBuilt: true,
      noHardSessions: true, maxLongRunKm: 12, maxWeeklyIncreasePct: 10,
    },
  },

  // ------------------------------------------------------------- returning
  {
    id: 'ex-marathoner-knee',
    who: '45-year-old, ran marathons 10 years ago, returning after a knee injury',
    profile: {
      age: 45, fitness_level: 'intermediate', experience_months: 144, weekly_volume_km: 5,
      longest_run_km: 4, target_distance_km: 10, days_per_week: 4,
      coach_notes: 'Pred 10 leti sem tekel maratone. Zdaj se vračam po poškodbi kolena, fizioterapevt mi je dovolil teči.',
    },
    memories: [{ category: 'injury', content: 'Poškodba kolena, zdaj brez bolečin, ne mara dveh dni zapored.' }],
    expect: {
      scenario: 'returning', verdict: 'feasible',
      noHardSessions: { firstWeeks: 6 }, noBackToBack: true,
      maxWeeklyIncreasePct: 10, startsBelowPrevious: true,
    },
  },
  {
    id: 'postpartum-return',
    who: 'Ran 5 years, 12 months off after pregnancy, doctor cleared her',
    profile: {
      age: 34, fitness_level: 'intermediate', experience_months: 60, weekly_volume_km: 0,
      days_per_week: 3,
      coach_notes: 'Leto dni premora zaradi nosečnosti, zdravnica mi je dovolila začeti.',
    },
    expect: {
      scenario: 'returning', verdict: 'feasible',
      noHardSessions: { firstWeeks: 6 }, maxWeeklyIncreasePct: 10, startsBelowPrevious: true,
    },
  },
  {
    id: 'returning-10k-in-6w',
    who: 'Returning after a 4-month break, wants a 10 km race in 6 weeks',
    profile: {
      age: 41, fitness_level: 'intermediate', experience_months: 72, weekly_volume_km: 10,
      longest_run_km: 5, target_distance_km: 10, event_date: sundayIn(6), days_per_week: 4,
      coach_notes: 'Štiri mesece nisem tekel, zdaj se vračam.',
    },
    expect: {
      scenario: 'returning', verdict: 'stretch', hasFallbackTarget: true,
      noHardSessions: { firstWeeks: 4 }, maxWeeklyIncreasePct: 10,
    },
  },

  // ------------------------------------------------------------ short race
  {
    id: 'sub45-10k-12w',
    who: '28-year-old, runs 40 km/week, wants sub-45 10 km in 12 weeks',
    profile: {
      age: 28, fitness_level: 'intermediate', experience_months: 36, weekly_volume_km: 40,
      longest_run_km: 16, target_distance_km: 10, target_time_min: 45, event_date: sundayIn(12),
      days_per_week: 5,
    },
    runs: [
      { date: daysAgo(3), distance: 10, duration: 47.5, effort: 5 }, // a 10 km time trial
      { date: daysAgo(5), distance: 8, duration: 44, effort: 2 },
      { date: daysAgo(8), distance: 15, duration: 85, effort: 3 },
    ],
    expect: {
      scenario: 'short_race', verdict: 'stretch', hasFallbackTarget: true,
      minHardPerWeek: { phase: 'build', count: 2 }, maxLongRunKm: 18,
      maxWeeklyIncreasePct: 10, taper: true,
    },
  },
  {
    id: 'fast-5k-advanced',
    who: 'Experienced runner, 60 km/week, chasing a 5 km PB in 10 weeks',
    profile: {
      age: 32, fitness_level: 'advanced', experience_months: 96, weekly_volume_km: 60,
      longest_run_km: 18, target_distance_km: 5, target_time_min: 19, event_date: sundayIn(10),
      days_per_week: 6,
    },
    runs: [{ date: daysAgo(4), distance: 5, duration: 19.6, effort: 5 }],
    expect: {
      scenario: 'short_race', verdict: 'feasible',
      minHardPerWeek: { phase: 'build', count: 2 }, hasRepetitionWork: true,
      maxLongRunKm: 18, maxWeeklyIncreasePct: 10, taper: true,
    },
  },

  // ------------------------------------------------------------- long race
  {
    id: 'two-day-marathon',
    who: 'Runner with only 2 available days per week targeting a marathon',
    profile: {
      age: 36, fitness_level: 'intermediate', experience_months: 36, weekly_volume_km: 25,
      longest_run_km: 14, target_distance_km: 42.2, event_date: sundayIn(20), days_per_week: 2,
      available_days: ['Wednesday', 'Sunday'],
    },
    expect: {
      scenario: 'long_race', verdict: 'unsafe',
      proposesSaferGoal: true, originalGoalNotBuilt: true, maxRunDays: 2,
      maxWeeklyIncreasePct: 10,
    },
  },
  {
    id: 'half-16w-intermediate',
    who: 'Runs 30 km/week, half marathon in 16 weeks',
    profile: {
      age: 30, fitness_level: 'intermediate', experience_months: 24, weekly_volume_km: 30,
      longest_run_km: 12, target_distance_km: 21.1, event_date: sundayIn(16), days_per_week: 4,
    },
    expect: {
      scenario: 'long_race', verdict: 'feasible',
      reachesLongRunKm: 16, maxLongRunKm: 21, maxWeeklyIncreasePct: 10, taper: true,
    },
  },
  {
    id: 'marathon-experienced-18w',
    who: 'Runs 55 km/week, marathon in 18 weeks',
    profile: {
      age: 39, fitness_level: 'advanced', experience_months: 84, weekly_volume_km: 55,
      longest_run_km: 24, target_distance_km: 42.2, event_date: sundayIn(18), days_per_week: 5,
    },
    expect: {
      scenario: 'long_race', verdict: 'feasible',
      reachesLongRunKm: 29, maxLongRunKm: 32, maxWeeklyIncreasePct: 10, taper: true,
      raceOnEventDay: true,
    },
  },
  {
    id: 'slow-marathoner',
    who: '52-year-old, 45 km/week at ~7:40/km easy, marathon in 20 weeks',
    profile: {
      age: 52, fitness_level: 'intermediate', experience_months: 48, weekly_volume_km: 45,
      longest_run_km: 22, target_distance_km: 42.2, event_date: sundayIn(20), days_per_week: 5,
    },
    runs: [
      { date: daysAgo(3), distance: 10, duration: 75, effort: 3 },
      { date: daysAgo(6), distance: 22, duration: 172, effort: 3 },
    ],
    // Three hours at their easy pace is ~23 km. The long run stops there —
    // time on feet, not a 30 km number — and that counts as ready.
    expect: {
      scenario: 'long_race', verdict: 'feasible',
      maxRunMinutes: 180, maxLongRunKm: 23, reachesLongRunKm: 22, maxWeeklyIncreasePct: 10, taper: true,
    },
  },
  {
    id: 'half-10w-thin-base',
    who: 'Runs 20 km/week, longest run 8 km, half marathon in 10 weeks',
    profile: {
      age: 27, fitness_level: 'intermediate', experience_months: 18, weekly_volume_km: 20,
      longest_run_km: 8, target_distance_km: 21.1, event_date: sundayIn(10), days_per_week: 4,
    },
    expect: {
      scenario: 'long_race', verdict: 'stretch', hasFallbackTarget: true,
      maxWeeklyIncreasePct: 10, maxLongRunKm: 18, taper: true,
    },
  },
  {
    id: 'ultra-50k',
    who: 'Runs 70 km/week, targets a 50 km trail race in 20 weeks',
    profile: {
      age: 44, fitness_level: 'advanced', experience_months: 120, weekly_volume_km: 70,
      longest_run_km: 28, target_distance_km: 50, event_date: sundayIn(20), days_per_week: 6,
    },
    expect: {
      scenario: 'long_race', verdict: 'feasible',
      maxLongRunKm: 35, maxWeeklyIncreasePct: 10, taper: true, raceOnEventDay: true,
    },
  },
  {
    id: 'half-far-away-30w',
    who: 'Runs 15 km/week, half marathon 30 weeks away (beyond one block)',
    profile: {
      age: 33, fitness_level: 'beginner', experience_months: 8, weekly_volume_km: 15,
      longest_run_km: 7, target_distance_km: 21.1, event_date: sundayIn(30), days_per_week: 4,
    },
    expect: {
      scenario: 'long_race', verdict: 'feasible',
      maxWeeklyIncreasePct: 10, raceOnEventDay: true, noEarlyRace: true,
    },
  },

  // -------------------------------------------------- no event: recreational
  {
    id: 'feel-fitter',
    who: 'Runner with no event and no target, just wants to feel fitter',
    profile: {
      age: 40, fitness_level: 'intermediate', experience_months: 24, weekly_volume_km: 12,
      longest_run_km: 6, days_per_week: 3,
      coach_notes: 'Nimam tekme, rad bi se samo počutil bolj fit.',
    },
    expect: {
      scenario: 'recreational', verdict: 'feasible',
      noHardSessions: true, noTaper: true, maxWeeklyIncreasePct: 10, mostlyEasy: true,
    },
  },
  {
    id: 'older-recreational',
    who: '70-year-old who jogs 15 km a week for health',
    profile: {
      age: 70, fitness_level: 'intermediate', experience_months: 120, weekly_volume_km: 15,
      longest_run_km: 7, days_per_week: 4,
    },
    expect: {
      scenario: 'recreational', verdict: 'feasible',
      noHardSessions: true, noTaper: true, noBackToBack: true, maxWeeklyIncreasePct: 10,
    },
  },
  {
    id: 'fit-maintain',
    who: 'Already fit, 50 km/week, wants to hold fitness over winter',
    profile: {
      age: 33, fitness_level: 'advanced', experience_months: 96, weekly_volume_km: 50,
      longest_run_km: 18, days_per_week: 5,
      coach_notes: 'Čez zimo želim samo ohraniti formo.',
    },
    expect: {
      scenario: 'maintenance', verdict: 'feasible',
      flatVolumePct: 10, noTaper: true, maxWeeklyIncreasePct: 10,
    },
  },

  // --------------------------------------------- clarify: missing / contradictory
  {
    id: 'ambiguous-beginner-veteran',
    who: 'Says "beginner" but has 5 years of running and gives no current volume',
    profile: {
      age: 50, fitness_level: 'beginner', experience_months: 60, days_per_week: 3,
    },
    answers: { current_volume: '0', returning: 'break' },
    expect: {
      questions: ['current_volume', 'returning'],
      scenario: 'returning', verdict: 'feasible', noHardSessions: { firstWeeks: 6 },
      maxWeeklyIncreasePct: 10,
    },
  },
  {
    id: 'contradictory-longest-run',
    who: 'Reports 10 km a week but a 25 km longest run in the last month',
    profile: {
      age: 29, fitness_level: 'intermediate', experience_months: 24, weekly_volume_km: 10,
      longest_run_km: 25, target_distance_km: 21.1, event_date: sundayIn(12), days_per_week: 4,
    },
    // Once the runner confirms 8 km is their real longest run, a half in 12
    // weeks from 10 km/week is unsafe (beginners.md: a 12-week half needs
    // 20-25 km/week to start). The plan is built for the 10 km on that date,
    // so it is a short-race plan.
    answers: { longest_run: '8' },
    expect: {
      questions: ['longest_run'],
      scenario: 'short_race', verdict: 'unsafe', proposesSaferGoal: true, originalGoalNotBuilt: true,
      maxWeeklyIncreasePct: 10, maxLongRunKm: 12,
    },
  },
  {
    id: 'event-date-passed',
    who: 'Race date entered is already in the past',
    profile: {
      age: 26, fitness_level: 'intermediate', experience_months: 12, weekly_volume_km: 20,
      longest_run_km: 8, target_distance_km: 10, event_date: '2026-09-01', days_per_week: 4,
    },
    answers: { event_date: 'no_date' },
    expect: {
      questions: ['event_date'],
      scenario: 'short_race', verdict: 'feasible', noEarlyRace: true, maxWeeklyIncreasePct: 10,
    },
  },
  {
    id: 'fit-no-goal-unclear',
    who: 'Fit runner, no goal given, intent unclear (hold or build?)',
    profile: {
      age: 37, fitness_level: 'advanced', experience_months: 60, weekly_volume_km: 45,
      longest_run_km: 16, days_per_week: 5,
    },
    answers: { intent: 'maintain' },
    expect: {
      questions: ['intent'],
      scenario: 'maintenance', verdict: 'feasible', flatVolumePct: 10, noTaper: true,
    },
  },
]

export { ALL_DAYS }
