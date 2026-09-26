// Metro: lets mobile/ import the shared engine from ../src/core unchanged.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')
const coreDir = path.join(repoRoot, 'src', 'core')

const config = getDefaultConfig(projectRoot)

// Watch the shared code. Packages imported from ../src resolve from
// mobile/node_modules (the repo root has the web app's own copies).
config.watchFolders = [path.join(repoRoot, 'src'), path.join(repoRoot, 'knowledge')]

// The two platform touchpoints of src/core (see src/core/README.md): env.js
// and the knowledge bundle are replaced by mobile/platform equivalents.
const PLATFORM = {
  './env': 'env.js',
  './env.js': 'env.js',
  './knowledge-files': 'knowledge-files.js',
  './knowledge-files.js': 'knowledge-files.js',
}
const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = PLATFORM[moduleName]
  if (target && path.dirname(context.originModulePath) === coreDir) {
    return { type: 'sourceFile', filePath: path.join(projectRoot, 'platform', target) }
  }
  const shared = context.originModulePath.startsWith(path.join(repoRoot, 'src') + path.sep)
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName)
  const ctx = shared && bare ? { ...context, originModulePath: path.join(projectRoot, 'index.js') } : context
  return (upstream || context.resolveRequest)(ctx, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './global.css' })
