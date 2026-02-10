/**
 * Unit tests for platform detection utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  detectPlatform,
  getPreferredShell,
  isWindows,
  isMacOS,
  isLinux,
  isUnix
} from '../../src/main/utils/platformDetection'

describe('Platform Detection', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true
    })
  })

  describe('detectPlatform', () => {
    it('should detect the current platform', () => {
      const platform = detectPlatform()
      expect(['darwin', 'win32', 'linux']).toContain(platform)
    })
  })

  describe('getPreferredShell', () => {
    it('should return powershell for Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(getPreferredShell()).toBe('powershell')
    })

    it('should return bash for macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(getPreferredShell()).toBe('bash')
    })

    it('should return bash for Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(getPreferredShell()).toBe('bash')
    })
  })

  describe('isWindows', () => {
    it('should return true on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(isWindows()).toBe(true)
    })

    it('should return false on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(isWindows()).toBe(false)
    })
  })

  describe('isMacOS', () => {
    it('should return true on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(isMacOS()).toBe(true)
    })

    it('should return false on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(isMacOS()).toBe(false)
    })
  })

  describe('isLinux', () => {
    it('should return true on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(isLinux()).toBe(true)
    })

    it('should return false on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(isLinux()).toBe(false)
    })
  })

  describe('isUnix', () => {
    it('should return true on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(isUnix()).toBe(true)
    })

    it('should return true on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(isUnix()).toBe(true)
    })

    it('should return false on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(isUnix()).toBe(false)
    })
  })
})
