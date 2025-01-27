export const getFileLanguage = (filePath: string): string => {
  const fileExtension = filePath.split('.').pop()?.toLowerCase()

  const languageMap: { [key: string]: string } = {
    js: 'javascript',
    ts: 'typescript',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    md: 'markdown',
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    go: 'go',
    sh: 'shell'
  }

  return languageMap[fileExtension || ''] || 'plaintext'
}
