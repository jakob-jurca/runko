/**
 * knowledge-files.js — the raw Markdown bundle, the second bundler touchpoint.
 *
 * Vite inlines these at build time. Metro has no import.meta.glob, so the
 * mobile app redirects this module to mobile/platform/knowledge-files.js (a
 * generated file with the same two exports).
 */
export const RAW_FILES = import.meta.glob('../../knowledge/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const RESEARCH_FILES = import.meta.glob('../../knowledge/research/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
