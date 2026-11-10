import path from 'node:path'

/** PATH without node_modules/.bin, so it can't shadow the project's Ruby tools. */
export function cleanPath(value: string | undefined = process.env.PATH): string {
  return (value || '')
    .split(path.delimiter)
    .filter((p) => !p.includes(path.join('node_modules', '.bin')))
    .join(path.delimiter)
}
