import { parseFrame } from './stackFrames'

export type EditorTarget = { fileName: string; filePath: string; line: number }

const isAbsolute = (file: string): boolean => file.startsWith('/') || /^[A-Za-z]:/.test(file)

export const editorTargetFor = (projectPath: string, appFrame: string): EditorTarget | null => {
  const frame = parseFrame(appFrame)
  if (!frame) return null
  const { file, line } = frame
  if (isAbsolute(file) || file.split(/[\\/]/).some((seg) => seg === '..')) return null
  const root = projectPath.replace(/[\\/]+$/, '')
  const filePath = `${root}/${file}`
  if (!filePath.startsWith(`${root}/`)) return null
  const fileName = file.split(/[\\/]/).pop() || file
  return { fileName, filePath, line }
}

export const resolveEditorTarget = async (
  projectPath: string,
  appFrame: string,
  api: { readFile: (path: string) => Promise<{ success: boolean }> }
): Promise<EditorTarget | null> => {
  const target = editorTargetFor(projectPath, appFrame)
  if (!target) return null
  try {
    const result = await api.readFile(target.filePath)
    return result.success ? target : null
  } catch {
    return null
  }
}
