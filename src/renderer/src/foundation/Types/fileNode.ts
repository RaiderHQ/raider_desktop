export interface FileNode {
  name: string
  isDirectory: boolean
  type: 'file' | 'folder'
  children?: FileNode[]
}
