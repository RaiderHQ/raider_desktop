import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installPickMode } from '../src/preload/pickMode'
import { assertionFields } from '../src/preload/assertionFields'
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
    pick.dispose()
    vi.useRealTimers()
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
    untrusting.dispose()
  })

  describe('after a pick', () => {
    const dispatch = (type: string, el: Element): MouseEvent => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true })
      el.dispatchEvent(event)
      return event
    }

    it('swallows the rest of a double-click, then lets clicks through after the grace window', () => {
      vi.useFakeTimers()
      const save = document.getElementById('save')!
      const pageDblclick = vi.fn()
      save.addEventListener('dblclick', pageDblclick)
      pick.setPicking(true)
      click(save)
      expect(send).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(200)
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
        expect(dispatch(type, save).defaultPrevented).toBe(true)
      }
      expect(click(save).defaultPrevented).toBe(true)
      dispatch('dblclick', save)
      expect(pageClick).not.toHaveBeenCalled()
      expect(recorderClick).not.toHaveBeenCalled()
      expect(pageDblclick).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(400)
      expect(click(save).defaultPrevented).toBe(false)
      expect(pageClick).toHaveBeenCalledTimes(1)
      expect(recorderClick).toHaveBeenCalledTimes(1)
    })

    it('swallows clicks just after a cancel but lets keys through', () => {
      vi.useFakeTimers()
      pick.setPicking(true)
      press('Escape')
      click(document.getElementById('save')!)
      press('Enter')
      expect(pageClick).not.toHaveBeenCalled()
      expect(recorderKeydown).toHaveBeenCalledTimes(1)
    })

    it('picks again at once when main turns picking back on (an unusable pick)', () => {
      vi.useFakeTimers()
      pick.setPicking(true)
      click(document.getElementById('save')!)
      pick.setPicking(true)
      click(document.getElementById('link')!)
      expect(send).toHaveBeenNthCalledWith(2, 'recorder-picked', {
        selector: '#link',
        strategy: 'css',
        innerText: 'Next'
      })
    })
  })

  it('follows the hovered element on scroll and resize, once per frame', () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => frames.push(cb))
    const save = document.getElementById('save')!
    let top = 10
    save.getBoundingClientRect = (): DOMRect => ({ top, left: 0, width: 30, height: 40 }) as DOMRect
    pick.setPicking(true)
    save.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    top = -50
    document.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(frames).toHaveLength(1)
    frames.shift()!(0)
    expect((outlines()[0] as HTMLElement).style.top).toBe('-50px')

    top = 5
    window.dispatchEvent(new Event('resize'))
    frames.shift()!(0)
    expect((outlines()[0] as HTMLElement).style.top).toBe('5px')
    raf.mockRestore()
  })

  it('takes focus away from the page when picking starts', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()
    expect(document.activeElement).toBe(field)
    pick.setPicking(true)
    expect(document.activeElement).not.toBe(field)
  })

  it('dispose removes its listeners and the outline', () => {
    pick.setPicking(true)
    document.getElementById('save')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    pick.dispose()
    click(document.getElementById('save')!)
    expect(outlines()).toHaveLength(0)
    expect(pageClick).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('the pick candidate carries value, input type, page title and url', () => {
    document.title = 'Sign in'
    pick.setPicking(false)
    pick = installPickMode(
      window,
      send,
      (el) => ({ ...candidate(el), ...assertionFields(el) }),
      trusted
    )
    document.body.innerHTML += '<input id="name" type="text" value="Ada">'
    pick.setPicking(true)
    click(document.getElementById('name')!)
    expect(send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        elementValue: 'Ada',
        inputType: 'text',
        pageTitle: 'Sign in',
        pageUrl: window.location.href
      })
    )
  })

  it('the pick candidate carries the full text, up to 2000 characters', () => {
    pick.setPicking(false)
    pick = installPickMode(
      window,
      send,
      (el) => ({ ...candidate(el), ...assertionFields(el) }),
      trusted
    )
    const el = document.createElement('p')
    el.id = 'long'
    document.body.appendChild(el)
    Object.defineProperty(el, 'innerText', { value: 'q'.repeat(3000) })
    pick.setPicking(true)
    click(el)
    const payload = send.mock.calls.at(-1)![1] as { elementText: string }
    expect(payload.elementText).toBe('q'.repeat(2000))
  })

  it("a secret field's value is empty in the candidate", () => {
    document.body.innerHTML += '<input id="pw" type="password" value="hunter2">'
    pick = installPickMode(
      window,
      send,
      (el) => ({ ...candidate(el), ...assertionFields(el) }),
      trusted
    )
    pick.setPicking(true)
    click(document.getElementById('pw')!)
    const payload = JSON.stringify(send.mock.calls)
    expect(payload).not.toContain('hunter2')
    expect(send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ elementValue: '', inputType: 'password' })
    )
  })

  it('a right-click while picking for a check is blocked', () => {
    // The recorder's own right-click listener sits on the document, as in recorderPreload
    const recorderMenu = vi.fn(() => send('show-assertion-context-menu', {}))
    document.addEventListener('contextmenu', recorderMenu, true)
    const pageMenu = vi.fn()
    document.getElementById('save')!.addEventListener('contextmenu', pageMenu)
    pick.setPicking(true)
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    document.getElementById('save')!.dispatchEvent(event)
    document.removeEventListener('contextmenu', recorderMenu, true)
    expect(event.defaultPrevented).toBe(true)
    expect(recorderMenu).not.toHaveBeenCalled()
    expect(pageMenu).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalledWith('show-assertion-context-menu', expect.anything())

    // Control: with picking off the same listener does run
    pick.setPicking(false)
    document.addEventListener('contextmenu', recorderMenu, true)
    document.getElementById('save')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    document.removeEventListener('contextmenu', recorderMenu, true)
    expect(recorderMenu).toHaveBeenCalledTimes(1)
  })
})
