import type { PickCandidate } from '../shared/types/pick'

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
 */
export function installPickMode(
  win: Window,
  send: (channel: PickChannel, payload?: PickCandidate) => void,
  candidate: (el: Element) => PickCandidate,
  // Only the user's own input picks or cancels; events made up by page scripts are just blocked
  isTrusted: (event: Event) => boolean = (event) => event.isTrusted
): { setPicking(on: boolean): void; isPicking(): boolean } {
  const doc = win.document
  let picking = false
  let outline: HTMLElement | null = null

  const removeOutline = (): void => {
    outline?.remove()
    outline = null
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
    const rect = el.getBoundingClientRect()
    outline.style.setProperty('top', `${rect.top}px`, 'important')
    outline.style.setProperty('left', `${rect.left}px`, 'important')
    outline.style.setProperty('width', `${rect.width}px`, 'important')
    outline.style.setProperty('height', `${rect.height}px`, 'important')
  }

  const setPicking = (on: boolean): void => {
    picking = on
    if (!on) removeOutline()
  }

  const block = (event: Event): void => {
    if (!picking) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!isTrusted(event)) return
    const target = event.target
    if (event.type === 'click' && target instanceof Element && target !== outline) {
      setPicking(false)
      send('recorder-picked', candidate(target))
    } else if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') {
      setPicking(false)
      send('recorder-pick-cancelled')
    }
  }

  for (const type of BLOCKED_EVENTS) win.addEventListener(type, block, true)

  win.addEventListener(
    'mouseover',
    (event) => {
      const target = event.target
      if (picking && target instanceof Element && target !== outline) drawOutline(target)
    },
    true
  )
  // Leaving the page ends picking here; main ends it on navigation too
  win.addEventListener('pagehide', () => setPicking(false))

  return { setPicking, isPicking: () => picking }
}
