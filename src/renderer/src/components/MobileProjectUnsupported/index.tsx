import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import Button from '@components/Button'

/**
 * Shown in place of the whole project view when the open project is a mobile (Appium) one:
 * this version of Raider opens web projects only, so nothing of the project is offered.
 */
const MobileProjectUnsupported: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col w-screen p-8">
      <div
        role="alert"
        data-testid="mobile-project-unsupported"
        className="flex flex-col gap-3 m-6 p-4 border border-neutral-bdr rounded-md bg-white max-w-xl"
      >
        <h2 className="text-base font-semibold text-neutral-dark">
          {t('mobileUnsupported.title')}
        </h2>
        <p className="text-sm text-neutral-dk">{t('mobileUnsupported.message')}</p>
        <div>
          <Button onClick={() => navigate('/start-project')} type="primary">
            {t('mobileUnsupported.openAnother')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default MobileProjectUnsupported
