import { PICK_GRACE_MS, type PickCandidate } from '../shared/types/pick'

type PickChannel = 'recorder-picked' | 'recorder-pick-cancelled'

// Everything that could act on the page; none of it reaches the page or the recorder while picking
const BLOCKED_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'auxclick',
  'dblclick',
  'contextmenu',
  'keydown',
  'keypress',
  'keyup'
]

// The rest of a double-click after the pick; key events aren't held back
const GRACE_EVENTS = new Set([
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'auxclick',
  'dblclick'
])

const OUTLINE_STYLE: Record<string, string> = {
  position: 'fixed',
  'pointer-events': 'none',
  'z-index': '2147483647',
  'box-sizing': 'border-box',
  margin: '0',
  padding: '0',
  border: '0',
  outline: '2px solid #2563eb',
  'outline-offset': '0',
  background: 'rgba(37, 99, 235, 0.08)',
  display: 'block'
}

/**
 * Pick mode for the recorder guest: while on, the next click names an element instead of acting
 * on the page, and Esc cancels. The listeners sit on the window in the capture phase, so they run
 * before the page's and the recorder's own document listeners.
 *
 * Only the top frame gets this preload: input inside an iframe acts on that frame and picks
 * nothing, so the app doesn't offer picking for steps inside frames.
 */
export function installPickMode(
  win: Window,
  send: (channel: PickChannel, payload?: PickCandidate) => void,
  candidate: (el: Element) => PickCandidate,
  // Only the user's own input picks or cancels; events made up by page scripts are just blocked
  isTrusted: (event: Event) => boolean = (event) => event.isTrusted
): { setPicking(on: boolean): void; isPicking(): boolean; dispose(): void } {
  const doc = win.document
  let picking = false
  // After a pick or cancel here, the rest of a double-click is swallowed until this time
  let swallowUntil = 0
  let outline: HTMLElement | null = null
  let hovered: Element | null = null
  let redrawFrame = 0

  const removeOutline = (): void => {
    if (redrawFrame) win.cancelAnimationFrame(redrawFrame)
    redrawFrame = 0
    outline?.remove()
    outline = null
    hovered = null
  }

  // A fixed, click-through box on the root element: it doesn't move the page's layout
  const drawOutline = (el: Element): void => {
    if (!outline) {
      outline = doc.createElement('div')
      outline.setAttribute('data-raider-pick-outline', '')
      outline.setAttribute('aria-hidden', 'true')
      for (const [name, value] of Object.entries(OUTLINE_STYLE)) {
        outline.style.setProperty(name, value, 'important')
      }
      doc.documentElement.appendChild(outline)
    }
    hovered = el
    const rect = el.getBoundingClientRect()
    outline.style.setProperty('top', `${rect.top}px`, 'important')
    outline.style.setProperty('left', `${rect.left}px`, 'important')
    outline.style.setProperty('width', `${rect.width}px`, 'important')
    outline.style.setProperty('height', `${rect.height}px`, 'important')
  }

  const setPicking = (on: boolean): void => {
    picking = on
    if (on) {
      swallowUntil = 0
      // A focused field could still take a menu paste or cut while picking
      const active = doc.activeElement
      if (active instanceof HTMLElement && active !== doc.body) active.blur()
    } else {
      removeOutline()
    }
  }

  const stopHere = (): void => {
    setPicking(false)
    swallowUntil = Date.now() + PICK_GRACE_MS
  }

  const block = (event: Event): void => {
    if (!picking) {
      if (Date.now() < swallowUntil && GRACE_EVENTS.has(event.type)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!isTrusted(event)) return
    const target = event.target
    if (event.type === 'click' && target instanceof Element && target !== outline) {
      stopHere()
      send('recorder-picked', candidate(target))
    } else if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') {
      stopHere()
      send('recorder-pick-cancelled')
    }
  }

  const onMouseOver = (event: Event): void => {
    const target = event.target
    if (picking && target instanceof Element && target !== outline) drawOutline(target)
  }

  // Scrolling or resizing moves the hovered element; follow it once per frame
  const onViewportChange = (): void => {
    if (!picking || !hovered || redrawFrame) return
    redrawFrame = win.requestAnimationFrame(() => {
      redrawFrame = 0
      if (!hovered) return
      if (hovered.isConnected) drawOutline(hovered)
      else removeOutline()
    })
  }

  // Leaving the page ends picking here; main ends it on navigation too
  const onPageHide = (): void => setPicking(false)

  for (const type of BLOCKED_EVENTS) win.addEventListener(type, block, true)
  win.addEventListener('mouseover', onMouseOver, true)
  win.addEventListener('scroll', onViewportChange, true)
  win.addEventListener('resize', onViewportChange)
  win.addEventListener('pagehide', onPageHide)

  const dispose = (): void => {
    setPicking(false)
    swallowUntil = 0
    for (const type of BLOCKED_EVENTS) win.removeEventListener(type, block, true)
    win.removeEventListener('mouseover', onMouseOver, true)
    win.removeEventListener('scroll', onViewportChange, true)
    win.removeEventListener('resize', onViewportChange)
    win.removeEventListener('pagehide', onPageHide)
  }

  return { setPicking, isPicking: () => picking, dispose }
}
