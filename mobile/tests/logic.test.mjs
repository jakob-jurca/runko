import { check, summary } from '../../tests/harness.mjs'
import { parseDecimal, parseWhole } from '../lib/parse.js'
import { readSeed, dot } from '../lib/onboarding-seed.js'
import { phaseStyle, PHASE_STYLES } from '../lib/phase.js'
import { PHASE_INTENT } from '../../src/core/periodization.js'

// Slovenian keyboards type a decimal comma.
check('comma decimal parses', parseDecimal('5,2') === 5.2)
check('dot decimal parses', parseDecimal('21.1') === 21.1)
check('whole number parses', parseDecimal('30') === 30)
check('empty is NaN', Number.isNaN(parseDecimal('')))
check('text is NaN', Number.isNaN(parseDecimal('abc')) && Number.isNaN(parseDecimal('5,2,1')))
check('negative is NaN', Number.isNaN(parseDecimal('-3')))
check('a number passes through', parseDecimal(4.5) === 4.5)
check('optional seconds default to 0', parseWhole('') === 0 && parseWhole('  ') === 0)
check('seconds parse', parseWhole('45') === 45)
check('decimal seconds are rejected', Number.isNaN(parseWhole('4.5')))
check('dot() normalises a comma', dot('72,5') === '72.5' && dot(null) === '')

// "What next?" after a goal block.
check('no seed without next', readSeed({}) === null && readSeed({ next: 'x' }) === null)
const repeat = readSeed({ next: 'repeat', main: 'kondicija', weeks: '8', level: '3', secondary: 'hitrost' })
check('repeat seed carries the goal', repeat.next === 'repeat' && repeat.main === 'kondicija' && repeat.weeks === 8 && repeat.level === 3 && repeat.secondary === 'hitrost')
check('unknown goal is dropped', readSeed({ next: 'switch', main: 'nonsense' }).main === '')
check('block length outside 4/8/12 is dropped', readSeed({ next: 'repeat', weeks: '7' }).weeks === null)
check('level is clamped to 1..5', readSeed({ next: 'repeat', level: '99' }).level === 5 && readSeed({ next: 'repeat' }).level === 1)

// Every phase the engine can produce has a colour.
check('every phase with an intent has a style', Object.keys(PHASE_INTENT).every((p) => PHASE_STYLES[p]))
check('unknown phase falls back', phaseStyle('zzz') === PHASE_STYLES.base)

export const result = summary('logic')
