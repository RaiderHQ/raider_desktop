// Stands in for rspec in runner tests, so no Ruby is needed.
// FAKE_SCRIPT (JSON):
//   steps: [{ delay?, event?, worker?, stdout?, stderr?, runJson? }]
//     event   - an object (JSON-encoded) or a raw string, appended to $RAIDER_EVENTS_DIR/worker-<worker|1>.ndjson
//     runJson - result statuses written to ./raider-results/run.json with finished_at = now
//     flowLog - { name, lines }: lines appended to ./.raider/flows/<name>/runs.jsonl; a line
//               with `ours: true` gets run_id = $RAIDER_FLOW_RUN_ID instead
//     flowRunJson - { dir, statuses }: like runJson, written to ./<dir>/run.json
//   exitCode     - exit code after the last step (default 0)
//   hang         - stay alive after the steps until signalled
//   ignoreSigint - ignore SIGINT (so only SIGKILL stops it)
//   grandchild   - a file path: first start a SIGINT-ignoring grandchild in its own process
//                  group (like chromedriver) and write its pid there
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const script = JSON.parse(process.env.FAKE_SCRIPT || '{}')
const eventsDir = process.env.RAIDER_EVENTS_DIR

process.on('SIGINT', () => {
  // Exit only once the marker is flushed: pipe writes are async on macOS
  process.stdout.write('fake: got SIGINT\n', () => {
    if (!script.ignoreSigint) process.exit(130)
  })
})

if (script.grandchild) {
  const grandchild = spawn(
    process.execPath,
    ['-e', "process.on('SIGINT', () => {}); setInterval(() => {}, 1000)"],
    { detached: true, stdio: 'ignore' }
  )
  grandchild.unref()
  fs.writeFileSync(script.grandchild, String(grandchild.pid))
}

for (const step of script.steps || []) {
  if (step.delay) await new Promise((resolve) => setTimeout(resolve, step.delay))
  if (step.event !== undefined) {
    const line = typeof step.event === 'string' ? step.event : JSON.stringify(step.event)
    fs.appendFileSync(path.join(eventsDir, `worker-${step.worker || 1}.ndjson`), `${line}\n`)
  }
  if (step.stdout) process.stdout.write(step.stdout)
  if (step.stderr) process.stderr.write(step.stderr)
  const runJsons = [
    ['raider-results', step.runJson],
    [step.flowRunJson?.dir, step.flowRunJson?.statuses]
  ]
  for (const [dir, statuses] of runJsons) {
    if (!statuses) continue
    fs.mkdirSync(dir, { recursive: true })
    const results = statuses.map((status, i) => ({ full_name: `test ${i}`, status }))
    fs.writeFileSync(
      path.join(dir, 'run.json'),
      JSON.stringify({ run: { finished_at: new Date().toISOString() }, results })
    )
  }
  if (step.flowLog) {
    const dir = path.join('.raider', 'flows', step.flowLog.name)
    fs.mkdirSync(dir, { recursive: true })
    const text = step.flowLog.lines
      .map(({ ours, ...line }) =>
        JSON.stringify(ours ? { ...line, run_id: process.env.RAIDER_FLOW_RUN_ID } : line)
      )
      .join('\n')
    fs.appendFileSync(path.join(dir, 'runs.jsonl'), `${text}\n`)
  }
}

if (script.hang) setInterval(() => {}, 1000)
// Let the loop drain instead of process.exit, so buffered output isn't lost
else process.exitCode = script.exitCode ?? 0
