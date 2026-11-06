import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'
import useRecorderStore from '@foundation/Stores/recorderStore'

const toolbarButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium transition-colors bg-white disabled:text-neutral-mid disabled:cursor-not-allowed'

// Which start is the latest: a late answer to an earlier one must not end a newer pick
let startToken = 0

/** Ends only the pick for a check; the recording goes on */
export const cancelAssertPick = (): void => {
  startToken++
  void Promise.resolve(window.api.setPickMode(false)).catch((error: unknown) =>
    console.error('Ending the pick failed:', error)
  )
  useRecorderStore.getState().setAssertPicking(false)
}

/** Picking an element to check: the banner goes when main reports the pick ended */
const startAssertPick = (): void => {
  const token = ++startToken
  const failed = (): void => {
    if (token === startToken) useRecorderStore.getState().setAssertPicking(false)
  }
  useRecorderStore.getState().setAssertPicking(true)
  Promise.resolve(window.api.setPickMode(true, 'assert'))
    .then((result) => {
      if (!result.success) failed()
    })
    .catch((error: unknown) => {
      console.error('Starting the pick failed:', error)
      failed()
    })
}

/** Esc ends the pick for a check from the app window too, not only from the page */
export function useEscEndsAssertPick(): void {
  const assertPicking = useRecorderStore((s) => s.assertPicking)
  useEffect((): (() => void) | void => {
    if (!assertPicking) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancelAssertPick()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [assertPicking])
}

export function CheckSomethingButton({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const assertPicking = useRecorderStore((s) => s.assertPicking)
  return (
    <Tooltip content={t('tooltips.testPage.addAssertion')} position="bottom">
      <button
        type="button"
        onClick={startAssertPick}
        disabled={disabled || assertPicking}
        className={`${toolbarButton} text-neutral-dark hover:bg-neutral-100`}
      >
        {t('testPage.addAssertion')}
      </button>
    </Tooltip>
  )
}

export function AssertPickBanner(): React.JSX.Element | null {
  const { t } = useTranslation()
  const assertPicking = useRecorderStore((s) => s.assertPicking)
  if (!assertPicking) return null
  return (
    <div
      role="status"
      className="flex items-center gap-3 text-sm font-medium px-3 py-2 rounded border border-neutral-bdr bg-neutral-50 text-neutral-dark"
    >
      <span className="flex-1">{t('testPage.assertPickBanner')}</span>
      <Tooltip content={t('tooltips.testPage.cancelPick')} position="bottom">
        <button
          type="button"
          onClick={cancelAssertPick}
          className={`${toolbarButton} text-neutral-dark hover:bg-neutral-100`}
        >
          {t('common.cancel')}
        </button>
      </Tooltip>
    </div>
  )
}
