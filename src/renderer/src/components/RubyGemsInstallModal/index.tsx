import React from 'react'
import ReactDOM from 'react-dom'
import Button from '@components/Button'
import { useTranslation } from 'react-i18next'

interface RubyGemsInstallModalProps {
  onInstall: () => void
  onClose: () => void
  missingGems: string[]
}

const RubyGemsInstallModal: React.FC<RubyGemsInstallModalProps> = ({
  onInstall,
  onClose,
  missingGems
}) => {
  const { t } = useTranslation()

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-neutral-bdr">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📦</span>
            <h2 className="text-lg font-semibold text-neutral-dark">
              {t('recorder.rubyGemsInstallModal.title')}
            </h2>
          </div>
          <p className="text-sm text-neutral-mid">
            {t('recorder.rubyGemsInstallModal.message', { missingGems: missingGems.join(', ') })}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Missing gems list */}
          <div>
            <p className="text-xs font-semibold text-neutral-dk mb-2 uppercase tracking-wide">Missing gems</p>
            <div className="flex flex-wrap gap-2">
              {missingGems.map((gem) => (
                <span
                  key={gem}
                  className="bg-status-err-bg text-red-700 text-xs font-mono px-2.5 py-1 rounded border border-red-200"
                >
                  {gem}
                </span>
              ))}
            </div>
          </div>

          {/* What clicking Install Now does */}
          <div className="bg-neutral-50 border border-neutral-bdr rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-neutral-dk">What "Install Now" does:</p>
            <p className="text-xs text-neutral-mid">
              Ruby Raider will run <code className="font-mono bg-white border border-neutral-bdr rounded px-1">gem install {missingGems.join(' ')}</code> in the background using your current Ruby version.
            </p>
          </div>

          {/* Manual fallback */}
          <div>
            <p className="text-xs text-neutral-mid">
              Prefer to install manually? Open a terminal and run:
            </p>
            <code className="block mt-1 bg-neutral-50 border border-neutral-bdr rounded px-3 py-2 text-xs font-mono text-neutral-dark break-all">
              gem install {missingGems.join(' ')}
            </code>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-neutral-bdr flex justify-end gap-3">
          <Button onClick={onClose} type="secondary">
            {t('recorder.rubyGemsInstallModal.no')}
          </Button>
          <Button onClick={onInstall} type="success">
            {t('recorder.rubyGemsInstallModal.yes')}
          </Button>
        </div>
      </div>
    </div>,
    document.getElementById('root')!
  )
}

export default RubyGemsInstallModal
