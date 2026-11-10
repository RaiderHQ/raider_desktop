export const DOCS_LINK_IDS = [
  'docs.home',
  'docs.gettingStarted',
  'docs.projects',
  'docs.recorder',
  'docs.assertions',
  'docs.recordingGuide',
  'docs.saving',
  'docs.shortcuts',
  'docs.running',
  'docs.dashboard',
  'docs.testScreen',
  'docs.errors',
  'docs.install',
  'docs.gem',
  'docs.site'
] as const

export type DocsLinkId = (typeof DOCS_LINK_IDS)[number]

export const isDocsLinkId = (v: unknown): v is DocsLinkId =>
  typeof v === 'string' && (DOCS_LINK_IDS as readonly string[]).includes(v)
