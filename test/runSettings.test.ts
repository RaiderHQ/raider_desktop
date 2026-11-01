import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadRunSettings,
  saveRunSettings,
  workersFor,
  loginStateFor
} from '@foundation/run/runSettings'

const d = { recommendedWorkers: 2, maxWorkers: 4 }
const on = { parallel: true, workers: null, quarantinedFails: false, reuseLogins: true }

beforeEach(() => localStorage.clear())

describe('run settings', () => {
  it('defaults', () => {
    expect(loadRunSettings('/p')).toEqual({
      parallel: false,
      workers: null,
      quarantinedFails: false,
      reuseLogins: true
    })
  })
  it('reuseLogins defaults to true when missing or not a boolean', () => {
    localStorage.setItem('raider.runSettings:/p', JSON.stringify({ parallel: true }))
    expect(loadRunSettings('/p').reuseLogins).toBe(true)
    localStorage.setItem('raider.runSettings:/p', JSON.stringify({ reuseLogins: 'no' }))
    expect(loadRunSettings('/p').reuseLogins).toBe(true)
  })
  it('round trips reuseLogins false', () => {
    saveRunSettings('/a', { ...on, reuseLogins: false })
    expect(loadRunSettings('/a').reuseLogins).toBe(false)
  })
  it('loginStateFor', () => {
    expect(loginStateFor({ ...on, reuseLogins: false }, false)).toBe('off')
    expect(loginStateFor({ ...on, reuseLogins: false }, true)).toBe('off')
    expect(loginStateFor(on, true)).toBe('refresh')
    expect(loginStateFor(on, false)).toBeUndefined()
  })
  it('round trips per project', () => {
    saveRunSettings('/a', { parallel: true, workers: 3, quarantinedFails: true, reuseLogins: true })
    expect(loadRunSettings('/a')).toEqual({
      parallel: true,
      workers: 3,
      quarantinedFails: true,
      reuseLogins: true
    })
    expect(loadRunSettings('/b').parallel).toBe(false)
  })
  it('stores settings under a namespaced key', () => {
    const s = { parallel: true, workers: 2, quarantinedFails: false, reuseLogins: true }
    saveRunSettings('/a', s)
    expect(JSON.parse(localStorage.getItem('raider.runSettings:/a') as string)).toEqual(s)
  })
  it('workersFor is undefined when not parallel', () => {
    expect(workersFor({ ...on, parallel: false }, d, { kind: 'all' })).toBeUndefined()
  })
  it('workersFor is undefined for a locations scope', () => {
    expect(
      workersFor(on, d, { kind: 'locations', locations: ['spec/a_spec.rb:1'] })
    ).toBeUndefined()
  })
  it('workersFor is undefined for a single file', () => {
    expect(workersFor(on, d, { kind: 'files', files: ['spec/a_spec.rb'] })).toBeUndefined()
  })
  it('uses the recommended count when workers is null', () => {
    expect(workersFor(on, d, { kind: 'all' })).toBe(2)
  })
  it('clamps to maxWorkers', () => {
    expect(workersFor({ ...on, workers: 99 }, d, { kind: 'all' })).toBe(4)
  })
})
