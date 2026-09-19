// Chat reply formatting: the persona bans markdown, this enforces it.
import { sanitizeChatReply, COACH_PERSONA } from '../src/core/coach-prompt.js'
import { check, summary } from './harness.mjs'

console.log('\n=== MARKDOWN IS STRIPPED FROM CHAT REPLIES ===')

const heavy = `### Your Long Run

Here is the plan:

- Warm up for **10 minutes**
- Then run 5km at \`5:30/km\`
- Cool down easy

1. Hydrate well
2. Stretch after`

const clean = sanitizeChatReply(heavy)
console.log('   ', JSON.stringify(clean))

check('no heading markers survive', !clean.includes('#'))
check('no bullet markers survive', !/^\s*[-*•]\s/m.test(clean))
check('no numbered-list markers survive', !/^\s*\d+[.)]\s/m.test(clean))
check('no bold markers survive', !clean.includes('**'))
check('no code backticks survive', !clean.includes('`'))
check('the heading text is kept', clean.includes('Your Long Run'))
check('list content is kept', clean.includes('Warm up for 10 minutes'))
check('the pace inside backticks is kept', clean.includes('5:30/km'))
check('list items become sentences', clean.includes('Warm up for 10 minutes. Then run 5km'))

console.log('\n=== ORDINARY PROSE IS LEFT ALONE ===')
const prose = 'Run it at 5:30/km and keep it conversational. If the knee niggles, stop.'
check('plain text is unchanged', sanitizeChatReply(prose) === prose)
const slovenian = 'Zjutraj preteci 8 km pri 6:10/km. Če te koleno boli, skrajšaj na 5 km.'
check('Slovenian is unchanged', sanitizeChatReply(slovenian) === slovenian)
check('a lone asterisk in prose is not eaten',
  sanitizeChatReply('Do 3 x 1km reps.') === 'Do 3 x 1km reps.')
check('paragraph breaks survive',
  sanitizeChatReply('First line.\n\nSecond line.') === 'First line.\n\nSecond line.')
check('runs of blank lines collapse',
  sanitizeChatReply('A.\n\n\n\nB.') === 'A.\n\nB.')

console.log('\n=== EDGE CASES ===')
check('empty string', sanitizeChatReply('') === '')
check('null', sanitizeChatReply(null) === '')
check('undefined', sanitizeChatReply(undefined) === '')
check('a number', sanitizeChatReply(42) === '')
check('only a heading', sanitizeChatReply('## Hello') === 'Hello')
check('only a bullet', sanitizeChatReply('- One thing') === 'One thing.')
check('leading/trailing whitespace trimmed', sanitizeChatReply('  hi  ') === 'hi')

console.log('\n=== THE PERSONA STILL FORBIDS IT UPSTREAM ===')
check('persona bans markdown headings', COACH_PERSONA.includes('no markdown'))
check('persona bans bullet lists', COACH_PERSONA.includes('no bullet lists'))
check('persona caps default reply length', COACH_PERSONA.includes('Two or three sentences'))

export default summary('chat formatting')
