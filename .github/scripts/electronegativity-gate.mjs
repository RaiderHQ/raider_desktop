// Fails the build when Electronegativity reports one of the checks we block on.
// Usage: node electronegativity-gate.mjs <results.csv>...
import { readFileSync } from 'node:fs'

const BLOCKING = [
  'CONTEXT_ISOLATION',
  'NODE_INTEGRATION',
  'OPEN_EXTERNAL',
  'PERMISSION_REQUEST_HANDLER',
  'WEB_SECURITY',
  'ALLOWED_POPUPS'
]

// Reviewed findings. The window guards call shell.openExternal only after
// isExternalUrl allowed the URL (http/https), on the same line.
const REVIEWED = [
  { check: 'OPEN_EXTERNAL', line: /if \(isExternalUrl\(\w+\)\) void [\w.]*openExternal\(/ }
]

const blocking = []
for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
  for (const row of rows) {
    const check = BLOCKING.find((name) => row.includes(name))
    if (!check) continue
    if (REVIEWED.some((r) => r.check === check && r.line.test(row))) {
      console.log(`reviewed: ${row}`)
      continue
    }
    blocking.push(`${file}: ${row}`)
  }
}

if (blocking.length > 0) {
  console.error(`Electronegativity found ${blocking.length} blocking issue(s):`)
  for (const finding of blocking) console.error(`  ${finding}`)
  process.exit(1)
}
console.log('No blocking Electronegativity findings.')
