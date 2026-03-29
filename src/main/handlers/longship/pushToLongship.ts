import { getLongshipConfig } from './longshipConfig'
import { appState } from '../appState'

interface TestResultPayload {
  project_name: string
  project_path: string | null
  framework: string | null
  automation: string | null
  status: 'passed' | 'failed'
  duration_seconds: number
  output: string
  run_at: string
}

/**
 * Pushes test results to Longship after a test run completes.
 * Fire-and-forget — does not throw or block on failure.
 */
export async function pushToLongship(
  success: boolean,
  output: string,
  durationMs: number
): Promise<void> {
  const config = getLongshipConfig()

  if (!config.enabled || !config.url || !config.apiKey) {
    return
  }

  const payload: TestResultPayload = {
    project_name: appState.projectPath?.split('/').pop() || 'unknown',
    project_path: appState.projectPath,
    framework: appState.projectFramework,
    automation: appState.projectAutomation,
    status: success ? 'passed' : 'failed',
    duration_seconds: Math.round(durationMs / 1000),
    output: output.slice(0, 100_000), // Cap at 100KB
    run_at: new Date().toISOString()
  }

  const url = config.url.replace(/\/$/, '')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    await fetch(`${url}/api/v1/webhooks/test_results`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    clearTimeout(timeout)
  } catch (err) {
    console.warn('Longship push failed:', err instanceof Error ? err.message : err)
  }
}
