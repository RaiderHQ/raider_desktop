import React from 'react'
import ReactDOM from 'react-dom'
import Button from '@components/Button'
import { useTranslation } from 'react-i18next'

interface RubyInstallModalProps {
  onClose: () => void
  onCloseApp: () => void
}

const steps = [
  {
    number: '1',
    titleKey: 'concepts.install.rbenv.title',
    descKey: 'concepts.install.rbenv.message',
    command: 'brew install rbenv ruby-build && rbenv init'
  },
  {
    number: '2',
    titleKey: 'concepts.install.ruby.title',
    descKey: 'concepts.install.ruby.message',
    command: 'rbenv install 3.4.1 && rbenv global 3.4.1'
  },
  {
    number: '3',
    titleKey: 'concepts.install.gem.title',
    descKey: 'concepts.install.gem.message',
    command: 'gem install ruby_raider'
  }
]

const RubyInstallModal: React.FC<RubyInstallModalProps> = ({ onClose, onCloseApp }) => {
  const { t } = useTranslation()

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-elevated w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-neutral-bdr shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">⚠️</span>
            <h2 className="text-lg font-semibold text-neutral-dark">
              {t('recorder.rubyInstallModal.title')}
            </h2>
          </div>
          <p className="text-sm text-neutral-mid">
            {t('recorder.rubyInstallModal.message')}
          </p>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-ruby text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.number}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-dark mb-0.5">{t(step.titleKey)}</p>
                <p className="text-xs text-neutral-mid mb-2">{t(step.descKey)}</p>
                <code className="block bg-neutral-50 border border-neutral-bdr rounded px-3 py-2 text-xs font-mono text-neutral-dark break-all">
                  {step.command}
                </code>
              </div>
            </div>
          ))}

          <p className="text-xs text-neutral-mid pt-2 border-t border-neutral-bdr">
            After installing, restart Ruby Raider for the changes to take effect.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-neutral-bdr flex justify-end gap-3 shrink-0">
          <Button onClick={onCloseApp} type="secondary">
            {t('recorder.rubyInstallModal.close')}
          </Button>
          <Button onClick={onClose} type="success">
            {t('recorder.rubyInstallModal.continue')}
          </Button>
        </div>
      </div>
    </div>,
    document.getElementById('root')!
  )
}

export default RubyInstallModal
