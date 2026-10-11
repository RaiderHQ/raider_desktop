// Reads raider_reporter's local output (raider-results/) into the shape the
// project dashboard already renders. Local only: no network access.

export interface DashboardResult {
  name: string
  status: string
  attachments?: { name: string; type: string; source: string }[]
  screenshot?: string
  statusDetails?: { message?: string; trace?: string }
}

interface DirNode {
  name: string
  type: string
  path?: string
}

export interface RaiderResultsApi {
  readDirectory: (folderPath: string) => Promise<DirNode[]>
  readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
}

interface RaiderResult {
  full_name?: string
  status?: string
  failure?: { message?: string; backtrace?: string[] }
  attachments?: { content_type?: string; path?: string }[]
}

const MAX_MESSAGE = 20000

export const sanitizeMessage = (message: string): string => {
  // eslint-disable-next-line no-control-regex
  let msg = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F�]/g, '')
  const encodingErrIdx = msg.indexOf('Unable to encode string')
  if (encodingErrIdx !== -1) {
    msg = msg.substring(0, encodingErrIdx).trim() || msg.substring(0, 500)
  }
  if (msg.length > MAX_MESSAGE) {
    msg = msg.substring(0, MAX_MESSAGE) + '\n… (message truncated)'
  }
  return msg
}

const mapStatus = (status: string | undefined): string =>
  status === 'pending' ? 'skipped' : (status ?? 'skipped')

const toRow = (result: RaiderResult, resultsDir: string): DashboardResult => {
  const row: DashboardResult = {
    name: result.full_name ?? '',
    status: mapStatus(result.status)
  }
  if (result.failure?.message !== undefined) {
    const trace = (result.failure.backtrace ?? []).join('\n')
    row.statusDetails = {
      message: trace ? `${result.failure.message}\n${trace}` : result.failure.message
    }
  }
  const image = (result.attachments ?? []).find(
    (a) => a.content_type?.startsWith('image/') && a.path
  )
  if (image?.path) row.screenshot = `${resultsDir}/${image.path}`
  return row
}

// run.json (unsharded) wins; otherwise merge run-<n>.json shards in numeric order.
const selectRunFiles = (nodes: DirNode[]): DirNode[] => {
  const files = nodes.filter((n) => n.type === 'file' && n.path)
  const single = files.find((n) => n.name === 'run.json')
  if (single) return [single]
  const shardIndex = (n: DirNode): number => {
    const m = /^run-(\d+)\.json$/.exec(n.name)
    return m ? Number(m[1]) : -1
  }
  return files.filter((n) => shardIndex(n) >= 0).sort((a, b) => shardIndex(a) - shardIndex(b))
}

export const loadRaiderResults = async (
  projectPath: string,
  api: RaiderResultsApi,
  onError?: (file: string, message: string) => void
): Promise<DashboardResult[] | null> => {
  const resultsDir = `${projectPath}/raider-results`
  let nodes: DirNode[]
  try {
    nodes = await api.readDirectory(resultsDir)
  } catch {
    return null
  }
  const runFiles = selectRunFiles(nodes ?? [])
  if (runFiles.length === 0) return null

  const rows: DashboardResult[] = []
  for (const file of runFiles) {
    const res = await api.readFile(file.path as string)
    if (!res.success || !res.data) {
      onError?.(file.name, res.error ?? 'could not read file')
      continue
    }
    try {
      const parsed = JSON.parse(res.data) as { results?: RaiderResult[] }
      for (const result of parsed.results ?? []) rows.push(toRow(result, resultsDir))
    } catch (e: unknown) {
      onError?.(file.name, (e as Error).message)
    }
  }
  return rows
}
