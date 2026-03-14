import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast, { Toaster } from 'react-hot-toast'
import Logo from '@components/Logo'
import NavBtn from '@components/NavBtn'
import RubyInstallModal from '@components/RubyInstallModal'
import RubyGemsInstallModal from '@components/RubyGemsInstallModal'
import useVersionStore from '@foundation/Stores/versionStore'
import useRubyStore from '@foundation/Stores/rubyStore'

const MainTemplate: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const location = useLocation()
  const raiderVersion = useVersionStore((state: { version: string }) => state.version)
  const { setRubyCommand, setRubyVersion, setVersionWarning } = useRubyStore()
  const [isRubyInstallModalOpen, setIsRubyInstallModalOpen] = useState(false)
  const [isGemsInstallModalOpen, setIsGemsInstallModalOpen] = useState(false)
  const [missingGems, setMissingGems] = useState<string[] | undefined>(undefined)

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

  const isActive = (paths: string[]): boolean =>
    paths.some((p) => (p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)))

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-3 border-b border-neutral-bdr shadow-nav">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <span className="text-lg font-bold text-neutral-dark tracking-tight">Ruby Raider</span>
        </div>

        {!isCreateProjectView && (
          <nav className="flex gap-2">
            <NavBtn to="/overview" label={t('menu.tests')} active={isActive(['/overview'])} />
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
