export interface CommandType {
  success: boolean
  output: string
  error?: string
}

export interface CommandOptions {
  shell: boolean
  cwd: string
}
