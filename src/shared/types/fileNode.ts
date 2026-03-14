export interface FileNode {
  name: string
  isDirectory: boolean
  type: 'file' | 'folder'
  path: string
  children?: FileNode[]
}
