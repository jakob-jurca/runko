import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { check, summary } from '../../tests/harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const mobile = path.resolve(here, '..')
const repo = path.resolve(mobile, '..')

// The knowledge bundle Metro gets must hold exactly what Vite's glob does.
execFileSync(process.execPath, [path.join(mobile, 'scripts', 'gen-knowledge.mjs')], { stdio: 'ignore' })
const generated = readFileSync(path.join(mobile, 'platform', 'knowledge-files.js'), 'utf8')
const json = (name) => JSON.parse(generated.split(`export const ${name} = `)[1].split('\n')[0])
const raw = json('RAW_FILES')
const research = json('RESEARCH_FILES')
const md = (dir) => readdirSync(dir).filter((f) => f.endsWith('.md'))

check('all top-level knowledge files bundled', Object.keys(raw).length === md(path.join(repo, 'knowledge')).length)
check('all research summaries bundled', Object.keys(research).length === md(path.join(repo, 'knowledge', 'research')).length)
check('keys look like the Vite glob keys', Object.keys(raw).every((k) => /^\.\.\/\.\.\/knowledge\/[^/]+\.md$/.test(k)))
check('research keys look like the Vite glob keys', Object.keys(research).every((k) => /^\.\.\/\.\.\/knowledge\/research\/[^/]+\.md$/.test(k)))
check('file contents are identical to disk',
  raw['../../knowledge/methodology.md'] === readFileSync(path.join(repo, 'knowledge', 'methodology.md'), 'utf8'))

// The shared touchpoints: the web file and the mobile replacement export the same names.
const exportsOf = (file) => [...readFileSync(file, 'utf8').matchAll(/export const (\w+)/g)].map((m) => m[1]).sort()
const webEnv = exportsOf(path.join(repo, 'src', 'core', 'env.js'))
const mobEnv = exportsOf(path.join(mobile, 'platform', 'env.js'))
check('platform env.js exports every name core/env.js does', webEnv.every((n) => mobEnv.includes(n)))
check('platform env.js exports nothing extra', mobEnv.every((n) => webEnv.includes(n)))
check('knowledge-files exports match', exportsOf(path.join(repo, 'src', 'core', 'knowledge-files.js')).join() === 'RAW_FILES,RESEARCH_FILES')

// Only EXPO_PUBLIC_ Supabase values, and no AI key in the app.
const envSrc = readFileSync(path.join(mobile, 'platform', 'env.js'), 'utf8')
const vars = [...envSrc.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]).sort()
check('only the two Supabase variables are read', vars.join() === 'EXPO_PUBLIC_SUPABASE_ANON_KEY,EXPO_PUBLIC_SUPABASE_URL')
check('.env.example holds the same two keys only',
  readFileSync(path.join(mobile, '.env.example'), 'utf8').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => l.split('=')[0]).sort().join() === vars.join())

// Metro redirects exactly the two touchpoints.
const metro = readFileSync(path.join(mobile, 'metro.config.js'), 'utf8')
check('metro redirects env and knowledge-files', /'\.\/env'/.test(metro) && /'\.\/knowledge-files'/.test(metro))

export const result = summary('platform')
