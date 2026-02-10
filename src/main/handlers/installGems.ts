import { ShellExecutor } from '../shell/ShellExecutor'

const handler = async (
  rubyCommand: string,
  gems: string[]
): Promise<{ success: boolean; output?: string; error?: string }> => {
  const command = `${rubyCommand} gem install ${gems.join(' ')}`

  // Use ShellExecutor for cross-platform command execution
  const executor = ShellExecutor.create()
  const result = await executor.execute(command)

  if (result.success) {
    return { success: true, output: result.output }
  } else {
    return { success: false, error: result.error || 'Gem installation failed', output: result.output }
  }
}

export default handler
