import { useEffect, useState, type RefObject } from 'react'

/**
 * True once the element has been on screen; it stays true after, so a row loads
 * its thumbnail once. Without IntersectionObserver it is true at once.
 */
export function useInView(ref: RefObject<Element>): boolean {
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = ref.current
    if (inView || !element) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInView(true)
        observer.disconnect()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, inView])

  return inView
}
