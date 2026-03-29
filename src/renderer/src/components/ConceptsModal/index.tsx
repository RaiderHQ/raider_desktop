import React, { useState } from 'react'
import ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import Logo from '@components/Logo'

interface Concept {
  icon: string
  titleKey: string
  messageKey: string
}

type OS = 'mac' | 'linux' | 'windows'

const concepts: Concept[] = [
  { icon: '🗂️', titleKey: 'concepts.suite.title', messageKey: 'concepts.suite.message' },
  { icon: '🧪', titleKey: 'concepts.test.title', messageKey: 'concepts.test.message' },
  { icon: '⏺️', titleKey: 'concepts.recording.title', messageKey: 'concepts.recording.message' },
  { icon: '▶️', titleKey: 'concepts.running.title', messageKey: 'concepts.running.message' },
  { icon: '📋', titleKey: 'concepts.steps.title', messageKey: 'concepts.steps.message' },
  { icon: '📁', titleKey: 'concepts.overview.title', messageKey: 'concepts.overview.message' },
]

const installSteps: Record<OS, { icon: string; titleKey: string; descKey: string; command: string }[]> = {
  mac: [
    {
      icon: '🍺',
      titleKey: 'concepts.install.mac.step1.title',
      descKey: 'concepts.install.mac.step1.desc',
      command: 'brew install rbenv ruby-build && rbenv init'
    },
    {
      icon: '💎',
      titleKey: 'concepts.install.mac.step2.title',
      descKey: 'concepts.install.mac.step2.desc',
      command: 'rbenv install 3.4.1 && rbenv global 3.4.1'
    },
    {
      icon: '🚀',
      titleKey: 'concepts.install.mac.step3.title',
      descKey: 'concepts.install.mac.step3.desc',
      command: 'gem install ruby_raider'
    }
  ],
  linux: [
    {
      icon: '📦',
      titleKey: 'concepts.install.linux.step1.title',
      descKey: 'concepts.install.linux.step1.desc',
      command: 'git clone https://github.com/rbenv/rbenv.git ~/.rbenv\ngit clone https://github.com/rbenv/ruby-build.git ~/.rbenv/plugins/ruby-build\necho \'eval "$(~/.rbenv/bin/rbenv init -)"\' >> ~/.bashrc && source ~/.bashrc'
    },
    {
      icon: '💎',
      titleKey: 'concepts.install.linux.step2.title',
      descKey: 'concepts.install.linux.step2.desc',
      command: 'rbenv install 3.4.1 && rbenv global 3.4.1'
    },
    {
      icon: '🚀',
      titleKey: 'concepts.install.linux.step3.title',
      descKey: 'concepts.install.linux.step3.desc',
      command: 'gem install ruby_raider'
    }
  ],
  windows: [
    {
      icon: '🖥️',
      titleKey: 'concepts.install.windows.step1.title',
      descKey: 'concepts.install.windows.step1.desc',
      command: 'wsl --install'
    },
    {
      icon: '🔁',
      titleKey: 'concepts.install.windows.step2.title',
      descKey: 'concepts.install.windows.step2.desc',
      command: '# Open WSL terminal, then follow the Linux steps above'
    },
    {
      icon: '🚀',
      titleKey: 'concepts.install.windows.step3.title',
      descKey: 'concepts.install.windows.step3.desc',
      command: 'gem install ruby_raider'
    }
  ]
}

const osTabs: { id: OS; label: string; icon: string }[] = [
  { id: 'mac', label: 'macOS', icon: '' },
  { id: 'linux', label: 'Linux', icon: '' },
  { id: 'windows', label: 'Windows', icon: '' }
]

interface ConceptsModalProps {
  onClose: () => void
}

const ConceptsModal: React.FC<ConceptsModalProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const [activeOS, setActiveOS] = useState<OS>('mac')

  const handleOverlayClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).id === 'concepts-overlay') onClose()
  }

  return ReactDOM.createPortal(
    <div
      id="concepts-overlay"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-white rounded-xl shadow-elevated w-full max-w-2xl relative flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-neutral-bdr shrink-0">
          <Logo size={28} />
          <div>
            <h2 className="text-lg font-semibold text-neutral-dark">{t('concepts.title')}</h2>
            <p className="text-xs text-neutral-mid">{t('concepts.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-neutral-mid hover:text-neutral-dark transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-4 space-y-6">
          {/* Key concepts grid */}
          <div className="grid grid-cols-2 gap-3">
            {concepts.map((concept) => (
              <div
                key={concept.titleKey}
                className="flex gap-3 p-3 rounded-lg border border-neutral-bdr bg-neutral-50 hover:bg-ruby-sub hover:border-ruby/30 transition-colors"
              >
                <span className="text-2xl leading-none shrink-0 mt-0.5">{concept.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-dark mb-0.5">{t(concept.titleKey)}</h3>
                  <p className="text-xs text-neutral-mid leading-relaxed">{t(concept.messageKey)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Installation section */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">⚙️</span>
              <h3 className="text-sm font-semibold text-neutral-dark">{t('concepts.installTitle')}</h3>
            </div>
            <p className="text-xs text-neutral-mid mb-3">{t('concepts.installSubtitle')}</p>

            {/* OS tabs */}
            <div className="flex border-b border-neutral-bdr mb-4">
              {osTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveOS(tab.id)}
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${
                    activeOS === tab.id
                      ? 'text-neutral-dark border-b-2 border-ruby -mb-px'
                      : 'text-neutral-mid hover:text-neutral-dk'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Windows coming-soon note */}
            {activeOS === 'windows' && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                <span className="text-sm mt-0.5">⚠️</span>
                <p className="text-xs text-amber-800">{t('concepts.install.windows.note')}</p>
              </div>
            )}

            {/* Steps for active OS */}
            <div className="space-y-3">
              {installSteps[activeOS].map((step, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg border border-neutral-bdr bg-neutral-50">
                  <span className="text-xl leading-none shrink-0 mt-0.5">{step.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-dark mb-0.5">{t(step.titleKey)}</p>
                    <p className="text-xs text-neutral-mid mb-2">{t(step.descKey)}</p>
                    <code className="block bg-white border border-neutral-bdr rounded px-3 py-2 text-xs font-mono text-neutral-dark break-all whitespace-pre-wrap">
                      {step.command}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-neutral-bdr shrink-0">
          <p className="text-xs text-neutral-mid text-center">{t('concepts.hint')}</p>
        </div>
      </div>
    </div>,
    document.getElementById('root')!
  )
}

export default ConceptsModal
