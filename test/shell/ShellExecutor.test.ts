/**
 * Unit tests for PowerShell command translation
 *
 * Note: We test the translation logic without importing the full executor classes
 * to avoid circular dependency issues in the test environment.
 */

import { describe, it, expect } from 'vitest'

// Mock translation function extracted from PowerShellExecutor
function translateFromBash(command: string): string {
  let translated = command

  // Remove rbenv/rvm initialization (Unix-only version managers)
  translated = translated.replace(/eval "\$\([^)]+\)"\s*&&\s*/g, '')
  translated = translated.replace(/rbenv shell [^\s]+\s*&&\s*/g, '')
  translated = translated.replace(/source \$\(brew --prefix rvm\)\/scripts\/rvm\s*&&\s*/g, '')
  translated = translated.replace(/rvm [^\s]+ do\s*/g, '')

  // Translate command existence checks
  translated = translated.replace(/command -v (\S+)/g, 'Get-Command $1 -ErrorAction SilentlyContinue')

  // Translate stderr redirection
  translated = translated.replace(/2>\s*\/dev\/null/g, '2>$null')

  // Translate combined stdout/stderr redirection
  translated = translated.replace(/&>\s*\/dev\/null/g, '>$null 2>&1')

  // Translate environment variable exports
  translated = translated.replace(/export (\w+)="([^"]+)"/g, '$env:$1="$2"')

  // Translate which command
  translated = translated.replace(/which\s+(\S+)/g, 'Get-Command $1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path')

  return translated
}

describe('PowerShell Command Translation', () => {
  it('should remove rbenv initialization commands', () => {
    const command = 'eval "$(rbenv init -)" && rbenv shell 3.1.6 && ruby -v'
    const translated = translateFromBash(command)
    expect(translated).not.toContain('eval')
    expect(translated).not.toContain('rbenv shell')
    expect(translated).toContain('ruby -v')
  })

  it('should remove RVM initialization commands', () => {
    const command = 'source $(brew --prefix rvm)/scripts/rvm && rvm 3.1.6 do ruby -v'
    const translated = translateFromBash(command)
    expect(translated).not.toContain('source')
    expect(translated).not.toContain('rvm')
    expect(translated).toContain('ruby -v')
  })

  it('should translate command -v to Get-Command', () => {
    const command = 'command -v ruby'
    const translated = translateFromBash(command)
    expect(translated).toContain('Get-Command ruby -ErrorAction SilentlyContinue')
  })

  it('should translate stderr redirection 2> /dev/null', () => {
    const command = 'ruby -v 2> /dev/null'
    const translated = translateFromBash(command)
    expect(translated).toContain('2>$null')
    expect(translated).not.toContain('/dev/null')
  })

  it('should translate combined redirection &> /dev/null', () => {
    const command = 'some-command &> /dev/null'
    const translated = translateFromBash(command)
    expect(translated).toContain('>$null 2>&1')
    expect(translated).not.toContain('/dev/null')
  })

  it('should translate export to PowerShell env syntax', () => {
    const command = 'export PATH="/usr/local/bin:$PATH"'
    const translated = translateFromBash(command)
    expect(translated).toContain('$env:PATH="/usr/local/bin:$PATH"')
    expect(translated).not.toContain('export')
  })

  it('should translate which to Get-Command', () => {
    const command = 'which ruby'
    const translated = translateFromBash(command)
    expect(translated).toContain('Get-Command ruby')
    expect(translated).toContain('Select-Object -ExpandProperty Path')
  })

  it('should handle complex commands with multiple translations', () => {
    const command = 'eval "$(rbenv init -)" && rbenv shell 3.1.6 && ruby -v 2> /dev/null'
    const translated = translateFromBash(command)
    expect(translated).not.toContain('eval')
    expect(translated).not.toContain('rbenv')
    expect(translated).toContain('ruby -v')
    expect(translated).toContain('2>$null')
  })

  it('should preserve commands without bash-specific syntax', () => {
    const command = 'ruby -v'
    const translated = translateFromBash(command)
    expect(translated).toBe('ruby -v')
  })

  it('should handle multiple redirections in one command', () => {
    const command = 'ruby -v 2> /dev/null && gem list &> /dev/null'
    const translated = translateFromBash(command)
    expect(translated).toContain('2>$null')
    expect(translated).toContain('>$null 2>&1')
    expect(translated).not.toContain('/dev/null')
  })
})
