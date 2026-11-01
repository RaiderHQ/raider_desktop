import React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { FaTimes } from 'react-icons/fa'
import { useRunStore, type MobileNotReady as NotReady } from '@foundation/Stores/runStore'

interface MobileNotReadyProps {
  notReady: NotReady
}

const buttonClass =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium'

/** Why a mobile run didn't start, and the ways forward. */
const MobileNotReady: React.FC<MobileNotReadyProps> = ({ notReady }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const checking = useRunStore((s) => s.checking)
  const { reason, detail, scope, origin } = notReady

  const message =
    reason === 'appium'
      ? t('run.mobile.appium', { address: detail })
      : detail === ''
        ? t('device.chooseAppPrompt')
        : t('run.mobile.app', { file: detail })

  // The device settings live on Overview's Files tab, which takes the focus from here
  const openDeviceSettings = (): void => {
    useRunStore.getState().requestDeviceFocus()
    if (pathname !== '/overview') navigate('/overview')
  }

  return (
    <div
      data-testid="mobile-not-ready"
      role="alert"
      className="flex items-center gap-3 p-3 border border-neutral-bdr rounded-md bg-white"
    >
      <p className="flex-1 min-w-0 text-sm text-neutral-dk">{message}</p>
      <button
        className={`${buttonClass} disabled:opacity-50 disabled:cursor-not-allowed`}
        disabled={checking}
        onClick={() => void useRunStore.getState().start(scope, origin)}
      >
        {t('run.mobile.tryAgain')}
      </button>
      {reason === 'appium' ? (
        <button
          className={buttonClass}
          onClick={() =>
            void useRunStore.getState().start(scope, origin, { skipMobileCheck: true })
          }
        >
          {t('run.mobile.runAnyway')}
        </button>
      ) : (
        <button className={buttonClass} onClick={openDeviceSettings}>
          {t('run.mobile.openDeviceSettings')}
        </button>
      )}
      <button
        aria-label={t('common.close')}
        className="p-1 text-neutral-mid hover:text-neutral-dark transition-colors"
        onClick={() => useRunStore.getState().dismissNotReady()}
      >
        <FaTimes size={10} aria-hidden />
      </button>
    </div>
  )
}

export default MobileNotReady
