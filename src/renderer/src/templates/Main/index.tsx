import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast, { Toaster } from 'react-hot-toast'
import Logo from '@components/Logo'
import NavBtn from '@components/NavBtn'
import ConceptsModal from '@components/ConceptsModal'
import RubyInstallModal from '@components/RubyInstallModal'
import RubyGemsInstallModal from '@components/RubyGemsInstallModal'
import useVersionStore from '@foundation/Stores/versionStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useProjectStore from '@foundation/Stores/projectStore'

const MainTemplate: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const location = useLocation()
  const raiderVersion = useVersionStore((state: { version: string }) => state.version)
  const { setRubyCommand, setRubyVersion, setVersionWarning } = useRubyStore()
  const [isRubyInstallModalOpen, setIsRubyInstallModalOpen] = useState(false)
  const [isGemsInstallModalOpen, setIsGemsInstallModalOpen] = useState(false)
  const [missingGems, setMissingGems] = useState<string[] | undefined>(undefined)
  const [isConceptsModalOpen, setIsConceptsModalOpen] = useState(false)

  // Run ruby check once at app startup
  useEffect(() => {
    const checkRuby = async (): Promise<void> => {
      try {
        const result = await window.api.isRubyInstalled()
        setRubyCommand(result.rubyCommand || null)
        setRubyVersion(result.rubyVersion || null)
        setVersionWarning(result.versionWarning || null)

        if (result.versionWarning) {
          toast(result.versionWarning, { icon: '\u26A0\uFE0F', duration: 8000 })
        }

        if (!result.success) {
          setMissingGems(result.missingGems)
          if (result.rubyCommand) {
            setIsGemsInstallModalOpen(true)
          } else {
            setIsRubyInstallModalOpen(true)
          }
        }
      } catch (error) {
        console.error('Ruby check failed:', error)
      }
    }
    checkRuby()
  }, [])

  const { rubyCommand } = useRubyStore()

  const handleInstallGems = async (): Promise<void> => {
    setIsGemsInstallModalOpen(false)
    const toastId = toast.loading(`Installing missing gems: ${missingGems?.join(', ')}...`)
    try {
      const result = await window.api.installGems(rubyCommand!, missingGems!)
      if (result.success) {
        toast.success('Gems installed successfully!', { id: toastId })
      } else {
        toast.error(`Failed to install gems: ${result.error}`, { id: toastId })
      }
    } catch (error) {
      toast.error(`Error installing gems: ${error}`, { id: toastId })
    }
  }

  const isCreateProjectView = location.pathname === '/project/new'
  const projectPath = useProjectStore((state) => state.projectPath)

  const isActive = (paths: string[]): boolean =>
    paths.some((p) => (p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)))

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-3 border-b border-neutral-bdr shadow-nav">
        <div className="flex items-center gap-3">
          {/* Logo: clickable, opens concepts modal */}
          <button
            onClick={() => setIsConceptsModalOpen(true)}
            aria-label="How Ruby Raider works"
            className="relative group focus:outline-none"
          >
            <Logo size={36} />
            {/* Hover ring */}
            <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 ring-2 ring-ruby/40 transition-opacity duration-200 pointer-events-none" />
            {/* Small "?" badge */}
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-ruby text-white text-[9px] font-bold flex items-center justify-center leading-none shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              ?
            </span>
          </button>
          <Link to="/overview" className="text-lg font-bold text-neutral-dark tracking-tight hover:text-ruby transition-colors">
            Ruby Raider
          </Link>
        </div>

        {!isCreateProjectView && projectPath && (
          <nav className="flex gap-2">
            <NavBtn to="/recorder" label="Recorder" active={isActive(['/recorder'])} />
          </nav>
        )}
      </header>

      <main className="flex flex-col items-center justify-center flex-grow animate-page-enter pt-8 pb-8">
        <Outlet />
      </main>

      <footer className="flex justify-center py-3 bg-white border-t border-neutral-bdr">
        <p className="text-neutral-mid text-sm">{t('version', { version: raiderVersion })}</p>
      </footer>

      {isConceptsModalOpen && (
        <ConceptsModal onClose={() => setIsConceptsModalOpen(false)} />
      )}

      {isRubyInstallModalOpen && (
        <RubyInstallModal
          onClose={() => setIsRubyInstallModalOpen(false)}
          onCloseApp={() => window.api.closeApp()}
        />
      )}
      {isGemsInstallModalOpen && missingGems && (
        <RubyGemsInstallModal
          onInstall={handleInstallGems}
          onClose={() => setIsGemsInstallModalOpen(false)}
          missingGems={missingGems}
        />
      )}

      <Toaster />
    </div>
  )
}

export default MainTemplate
