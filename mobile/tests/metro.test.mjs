import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { check, summary } from '../../tests/harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const mobile = path.resolve(here, '..')
const repo = path.resolve(mobile, '..')
const require = createRequire(path.join(mobile, 'package.json'))
const config = require(path.join(mobile, 'metro.config.js'))

const seen = []
const context = (originModulePath) => ({
  originModulePath,
  resolveRequest: (ctx, name) => {
    seen.push({ name, origin: ctx.originModulePath })
    return { type: 'sourceFile', filePath: `resolved:${name}` }
  },
})
const resolve = (origin, name) => config.resolver.resolveRequest(context(origin), name, 'android')
const core = (f) => path.join(repo, 'src', 'core', f)

check('shared code is watched', config.watchFolders.includes(path.join(repo, 'src')) && config.watchFolders.includes(path.join(repo, 'knowledge')))

const env = resolve(core('supabase.js'), './env')
check("core's ./env is replaced by platform/env.js", env.filePath === path.join(mobile, 'platform', 'env.js'))
check("core's ./env.js is replaced too", resolve(core('subscription.js'), './env.js').filePath === path.join(mobile, 'platform', 'env.js'))
check("core's ./knowledge-files is replaced", resolve(core('knowledge.js'), './knowledge-files.js').filePath === path.join(mobile, 'platform', 'knowledge-files.js'))
check('only files directly in src/core are redirected', resolve(path.join(repo, 'src', 'core', 'planning', 'x.js'), './env').filePath === 'resolved:./env')
check('the mobile app is not redirected', resolve(path.join(mobile, 'app', 'x.jsx'), './env').filePath === 'resolved:./env')

seen.length = 0
resolve(core('supabase.js'), '@supabase/supabase-js')
check('packages imported from src resolve from mobile/node_modules', seen[0].origin === path.join(mobile, 'index.js'))
seen.length = 0
resolve(core('db.js'), './supabase')
check('relative imports inside core are untouched', seen[0].origin === core('db.js'))

export const result = summary('metro')
