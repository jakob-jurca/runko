/**
 * Catches "X is not defined" at test time instead of in the browser.
 *
 * This exists because of a real crash: date helpers were moved out of db.js
 * into dates.js and db.js was given a RE-EXPORT
 *
 *     export { startOfWeekISO } from './dates.js'
 *
 * which makes the name available to importers but does NOT bind it inside
 * db.js itself. currentWeekNumber kept calling it and threw at runtime.
 *
 * Nothing caught it: Rollup treats an unresolved identifier as a global and
 * builds happily, and the unit tests imported dates.js directly so they never
 * ran the broken caller. A static check is the right tool.
 *
 * It scans every source file for CALLS to functions exported by src/core and
 * asserts the calling file can actually see the name.
 */
import fs from 'node:fs'
import path from 'node:path'
import { check, summary } from './harness.mjs'

const SRC = 'src'

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

const files = walk(SRC)

/** Every function name exported by a core module, and where from. */
const exportedBy = new Map()
for (const file of files.filter((f) => f.includes(path.join('src', 'core')))) {
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) {
    exportedBy.set(m[1], file)
  }
}

/** Names a file can legally reference: imported, declared, or a parameter. */
function visibleNames(src) {
  const names = new Set()

  // import { a, b as c } from '…'   /   import d from '…'
  for (const m of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/gm)) {
    const clause = m[1]
    for (const named of clause.matchAll(/\{([\s\S]*?)\}/g)) {
      for (const part of named[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim()
        if (name) names.add(name)
      }
    }
    const def = clause.replace(/\{[\s\S]*?\}/g, '').replace(/[*,]/g, '').trim()
    if (def && /^\w+$/.test(def)) names.add(def)
  }

  // local declarations of any kind
  for (const m of src.matchAll(/(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) names.add(m[1])
  for (const m of src.matchAll(/(?:^|\s)(?:export\s+)?(?:const|let|var)\s+(\w+)/g)) names.add(m[1])
  for (const m of src.matchAll(/(?:^|\s)class\s+(\w+)/g)) names.add(m[1])
  // destructured consts: const { a, b } = …
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':').pop().trim().split('=')[0].trim()
      if (/^\w+$/.test(name)) names.add(name)
    }
  }
  return names
}

console.log('\n=== EVERY CALLED CORE FUNCTION IS VISIBLE TO ITS CALLER ===')
console.log(`    ${exportedBy.size} exported functions, ${files.length} source files`)

const problems = []
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  // Strip comments and strings so prose and template text cannot trigger it.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

  const visible = visibleNames(src)

  for (const [name, source] of exportedBy) {
    if (path.resolve(source) === path.resolve(file)) continue // defines it
    // A call, not a property access or a key.
    const called = new RegExp(`(^|[^.\\w])${name}\\s*\\(`).test(code)
    if (called && !visible.has(name)) {
      problems.push(`${file} calls ${name}() but never imports it (exported by ${source})`)
    }
  }
}

check(
  problems.length === 0
    ? 'no file calls a core function it cannot see'
    : `${problems.length} unresolved call(s)`,
  problems.length === 0
)
for (const p of problems) console.log('    ✗ ' + p)

console.log('\n=== RE-EXPORTS DO NOT COUNT AS LOCAL BINDINGS ===')
// Guard the specific shape that caused the crash: a file that re-exports a
// name AND calls it must also import it.
const reexportTraps = []
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const reexported = new Set()
  for (const m of src.matchAll(/^export\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim()
      if (name) reexported.add(name)
    }
  }
  if (!reexported.size) continue
  const visible = visibleNames(src)
  const code = src.replace(/^export\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]/gm, '')
  for (const name of reexported) {
    if (new RegExp(`(^|[^.\\w])${name}\\s*\\(`).test(code) && !visible.has(name)) {
      reexportTraps.push(`${file}: re-exports ${name} and calls it, but does not import it`)
    }
  }
}
check(
  reexportTraps.length === 0
    ? 'no file mistakes a re-export for an import'
    : `${reexportTraps.length} re-export trap(s)`,
  reexportTraps.length === 0
)
for (const p of reexportTraps) console.log('    ✗ ' + p)

console.log('\n=== THE DATE HELPERS SPECIFICALLY ===')
const dateFns = ['todayISO', 'startOfWeekISO', 'addDaysISO', 'weekStartISO', 'currentWeekNumber']
for (const fn of dateFns) {
  const callers = files.filter((f) => {
    const src = fs.readFileSync(f, 'utf8')
    const code = src.replace(/^export\s*\{[\s\S]*?\}\s*from[^\n]*/gm, '')
    return new RegExp(`(^|[^.\\w])${fn}\\s*\\(`).test(code)
  })
  const broken = callers.filter((f) => !visibleNames(fs.readFileSync(f, 'utf8')).has(fn))
  check(`${fn}: ${callers.length} caller(s), all can see it`, broken.length === 0)
  for (const b of broken) console.log('    ✗ ' + b)
}

export default summary('imports')
