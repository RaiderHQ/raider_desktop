import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installPickMode } from '../src/preload/pickMode'
import type { PickCandidate } from '../src/shared/types/pick'

// jsdom marks dispatched events untrusted; the tests treat them as the user's own
const trusted = (): boolean => true

describe('installPickMode', () => {
  let send: ReturnType<typeof vi.fn>
  let pageClick: ReturnType<typeof vi.fn>
  let recorderClick: ReturnType<typeof vi.fn>
  let recorderKeydown: ReturnType<typeof vi.fn>
  let pick: ReturnType<typeof installPickMode>
  const candidate = (el: Element): PickCandidate => ({
    selector: `#${el.id}`,
    strategy: 'css',
    innerText: el.textContent ?? ''
  })

  beforeEach(() => {
    document.body.innerHTML =
      '<form id="form"><button id="save" type="submit">Save</button></form><a id="link" href="#next">Next</a>'
    send = vi.fn()
    pageClick = vi.fn()
    recorderClick = vi.fn()
    recorderKeydown = vi.fn()
    // The pick listeners go on first, as in recorderPreload
    pick = installPickMode(window, send, candidate, trusted)
    document.getElementById('save')!.addEventListener('click', pageClick)
    // jsdom can't submit a form; an unpicked click on Save would otherwise try
    document.getElementById('form')!.addEventListener('submit', (e) => e.preventDefault())
    document.addEventListener('click', recorderClick, true)
    document.addEventListener('keydown', recorderKeydown, true)
  })

  afterEach(() => {
    pick.setPicking(false)
    document.removeEventListener('click', recorderClick, true)
    document.removeEventListener('keydown', recorderKeydown, true)
  })

  const click = (el: Element): MouseEvent => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    return event
  }
  const press = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    return event
  }
  const outlines = (): NodeListOf<Element> =>
    document.querySelectorAll('[data-raider-pick-outline]')

  it('captures a click: no page or recorder listener runs, the candidate is sent, picking ends', () => {
    pick.setPicking(true)
    const event = click(document.getElementById('save')!)

    expect(pageClick).not.toHaveBeenCalled()
    expect(recorderClick).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    expect(send).toHaveBeenCalledWith('recorder-picked', {
      selector: '#save',
      strategy: 'css',
      innerText: 'Save'
    })
    expect(pick.isPicking()).toBe(false)
  })

  it('does not submit a form when its submit button is picked', () => {
    const submit = vi.fn((e: Event) => e.preventDefault())
    document.getElementById('form')!.addEventListener('submit', submit)
    pick.setPicking(true)
    click(document.getElementById('save')!)
    expect(submit).not.toHaveBeenCalled()
  })

  it('does not follow a picked link', () => {
    pick.setPicking(true)
    const event = click(document.getElementById('link')!)
    expect(event.defaultPrevented).toBe(true)
    expect(window.location.hash).not.toBe('#next')
  })

  it.each(['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'contextmenu', 'dblclick'])(
    'stops %s from reaching the page',
    (type) => {
      const page = vi.fn()
      document.getElementById('save')!.addEventListener(type, page)
      pick.setPicking(true)
      const event = new MouseEvent(type, { bubbles: true, cancelable: true })
      document.getElementById('save')!.dispatchEvent(event)
      expect(page).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(true)
      expect(send).not.toHaveBeenCalled()
      expect(pick.isPicking()).toBe(true)
    }
  )

  it('cancels on Escape without the recorder seeing the key', () => {
    pick.setPicking(true)
    press('Escape')
    expect(send).toHaveBeenCalledWith('recorder-pick-cancelled')
    expect(recorderKeydown).not.toHaveBeenCalled()
    expect(pick.isPicking()).toBe(false)
  })

  it.each(['Enter', ' '])('stops %p from activating anything while picking', (key) => {
    const page = vi.fn()
    document.getElementById('save')!.addEventListener('keydown', page)
    document.getElementById('save')!.addEventListener('keyup', page)
    pick.setPicking(true)
    const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    const up = new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })
    document.getElementById('save')!.dispatchEvent(down)
    document.getElementById('save')!.dispatchEvent(up)
    expect(page).not.toHaveBeenCalled()
    expect(recorderKeydown).not.toHaveBeenCalled()
    expect(down.defaultPrevented).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('draws one fixed, click-through outline over the hovered element and removes it on stop', () => {
    pick.setPicking(true)
    const save = document.getElementById('save')!
    save.getBoundingClientRect = (): DOMRect =>
      ({ top: 10, left: 20, width: 30, height: 40 }) as DOMRect
    save.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    document.getElementById('link')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    save.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    expect(outlines()).toHaveLength(1)
    const outline = outlines()[0] as HTMLElement
    expect(outline.style.position).toBe('fixed')
    expect(outline.style.pointerEvents).toBe('none')
    expect(outline.style.top).toBe('10px')
    expect(outline.style.left).toBe('20px')
    expect(outline.style.width).toBe('30px')
    expect(outline.style.height).toBe('40px')
    expect(document.body.contains(outline)).toBe(false)

    pick.setPicking(false)
    expect(outlines()).toHaveLength(0)
  })

  it('removes the outline after a pick and after a cancel', () => {
    pick.setPicking(true)
    document.getElementById('save')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    click(document.getElementById('save')!)
    expect(outlines()).toHaveLength(0)

    pick.setPicking(true)
    document.getElementById('save')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    press('Escape')
    expect(outlines()).toHaveLength(0)
  })

  it('ends picking when the page is left', () => {
    pick.setPicking(true)
    document.getElementById('save')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    window.dispatchEvent(new Event('pagehide'))
    expect(pick.isPicking()).toBe(false)
    expect(outlines()).toHaveLength(0)
  })

  it('leaves events alone when not picking', () => {
    click(document.getElementById('save')!)
    press('Escape')
    document.getElementById('save')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(pageClick).toHaveBeenCalledTimes(1)
    expect(recorderClick).toHaveBeenCalledTimes(1)
    expect(recorderKeydown).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
    expect(outlines()).toHaveLength(0)
  })

  it('blocks but does not pick or cancel on events the page script made up', () => {
    // The trusted instance above stays off; this one uses the real isTrusted check
    const untrusting = installPickMode(window, send, candidate)
    untrusting.setPicking(true)
    const event = click(document.getElementById('save')!)
    press('Escape')
    expect(pageClick).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    expect(send).not.toHaveBeenCalled()
    expect(untrusting.isPicking()).toBe(true)
    untrusting.setPicking(false)
  })
})
