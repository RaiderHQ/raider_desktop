import { runCommand } from './runRubyRaider'
import { CommandType } from '@foundation/Types/commandType'

const handler = async (): Promise<CommandType> => {
  return runCommand('gem', ['install', 'ruby_raider'], {
    shell: process.platform === 'win32',
    cwd: process.cwd()
  })
}

export default handler
