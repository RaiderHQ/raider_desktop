import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import ProjectSelector from '@components/ProjectSelector'
import Logo from '@components/Logo'
import Tooltip from '@components/Tooltip'
import InformationModal from '@components/InformationModal'
import QuickRecordDialog from '@components/QuickRecordDialog'
import OpenFolder from '@assets/icons/open-folder.svg'
import AddIcon from '@assets/icons/add.svg'
import RecorderIcon from '@assets/icons/bxs_up-arrow_side.svg'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'
import type { QuickProject } from '@shared/types/quickProject'
import type { RecentProjectEntry } from '@shared/types/recentProject'

const Landing: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [quickRecordOpen, setQuickRecordOpen] = useState(false)

  const setLoading: (loading: boolean) => void = useLoadingStore(
    (state: { setLoading: (loading: boolean) => void }) => state.setLoading
  )
  const setProjectPath: (path: string) => void = useProjectStore(
    (state: { setProjectPath: (path: string) => void }) => state.setProjectPath
  )

  // Quick recordings not saved to a folder yet, so they can be found again
  const [quickProjects, setQuickProjects] = useState<QuickProject[]>([])
  useEffect(() => {
    let current = true
    Promise.resolve(window.api.listQuickProjects())
      .then((projects) => {
        if (current) setQuickProjects(projects ?? [])
      })
      .catch((error: unknown) => console.error('Listing the quick recordings failed:', error))
    return (): void => {
      current = false
    }
  }, [])

  // Projects opened with Raider on this computer; main keeps the list (U8)
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  useEffect(() => {
    let current = true
    Promise.resolve(window.api.listRecentProjects())
      .then((projects) => {
        if (current) setRecentProjects(projects ?? [])
      })
      .catch((error: unknown) => console.error('Listing the recent projects failed:', error))
    return (): void => {
      current = false
    }
  }, [])

  // A remembered folder opens with no folder dialog; main checks it as it does for any open
  const openRecentProject = (project: RecentProjectEntry): void => {
    setProjectPath(project.path)
    navigate('/overview')
  }

  const removeRecentProject = async (project: RecentProjectEntry): Promise<void> => {
    try {
      setRecentProjects(await window.api.removeRecentProject(project.path))
    } catch (error) {
      console.error('Removing the recent project failed:', error)
    }
  }

  // Opens like a new quick recording does: on its tests, with the Save project to… banner
  const openQuickProject = (project: QuickProject): void => {
    setProjectPath(project.path)
    navigate('/overview/tests')
  }

  const handleOpenProject = async (): Promise<void> => {
    try {
      setLoading(true)
      const folder = await window.api.selectFolder(t('landing.error.selectFolder'))

      if (!folder) {
        toast(t('landing.error.noFolderSelected'), { icon: 'ℹ️' })
        return
      }

      setProjectPath(folder)
      navigate('/overview')
    } catch (error) {
      toast.error(t('landing.error.openProject'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex flex-col items-center justify-center flex-grow">
        {/* Clickable logo with speech bubble */}
        <div className="relative mb-8 flex flex-col items-center">
          <Tooltip content={t('tooltips.landing.logo')} position="bottom">
            <button
              onClick={() => setHelpOpen(true)}
              className="relative group focus:outline-none"
              aria-label={t('landing.logoLabel')}
            >
              <Logo size={120} />
              {/* Pulse ring to draw attention */}
              <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-ruby pointer-events-none" />
            </button>
          </Tooltip>

          {/* Speech bubble */}
          <div className="mt-3 relative bg-white border border-neutral-bdr rounded-lg px-3 py-1.5 shadow-sm text-xs text-neutral-dk font-medium whitespace-nowrap">
            {/* Bubble tail pointing up */}
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-neutral-bdr" />
            <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[7px] border-b-white" />
            {t('landing.bubble')}
          </div>
        </div>

        <h1 className="text-[2.5rem] font-bold text-neutral-dark mb-4">{t('landing.title')}</h1>

        <p className="text-center text-lg md:text-xl lg:text-2xl text-neutral-mid mb-8">
          {t('landing.subtitle')}
        </p>

        <div className="grid grid-cols-3 gap-8 mb-8">
          <ProjectSelector
            icon={RecorderIcon}
            description={t('button.recorder.description')}
            onClick={() => setQuickRecordOpen(true)}
            buttonValue={t('button.recorder.text')}
            modalTitleKey="information.quickRecord.title"
            modalMessageKey="information.quickRecord.message"
            tooltip={t('tooltips.landing.quickRecord')}
          />
          <ProjectSelector
            icon={OpenFolder}
            description={t('button.create.description')}
            url="/new"
            buttonValue={t('button.create.text')}
            modalTitleKey="information.createProject.title"
            modalMessageKey="information.createProject.message"
            tooltip={t('tooltips.landing.create')}
          />
          <ProjectSelector
            icon={AddIcon}
            description={t('button.open.description')}
            buttonValue={t('button.open.text')}
            modalTitleKey="information.openProject.title"
            modalMessageKey="information.openProject.message"
            tooltip={t('tooltips.landing.open')}
            shortcut="open-project"
            onClick={handleOpenProject}
          />
        </div>

        {recentProjects.length > 0 && (
          <section aria-labelledby="recent-projects" className="w-full max-w-xl mb-8">
            <h2 id="recent-projects" className="text-lg font-semibold text-neutral-dark">
              {t('landing.recentProjects.title')}
            </h2>
            <p className="text-sm text-neutral-md mb-3">{t('landing.recentProjects.hint')}</p>
            <ul className="border border-neutral-bdr rounded-lg bg-white shadow-card divide-y divide-neutral-bdr">
              {recentProjects.map((project) => (
                <li
                  key={project.path}
                  className={`flex items-center gap-2 pr-2 ${project.exists ? '' : 'text-neutral-md'}`}
                >
                  {project.exists ? (
                    <Tooltip
                      content={t('tooltips.landing.recentProject')}
                      position="top"
                      className="flex-1 min-w-0"
                    >
                      <button
                        onClick={() => openRecentProject(project)}
                        title={project.path}
                        className="w-full flex items-center justify-between gap-4 px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-neutral-dark truncate">
                            {project.name}
                          </span>
                          <span className="block text-xs text-neutral-md truncate">
                            {project.path}
                          </span>
                        </span>
                        <span className="text-xs text-neutral-md shrink-0">
                          {t('landing.recentProjects.opened', {
                            date: new Date(project.lastOpened).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })
                          })}
                        </span>
                      </button>
                    </Tooltip>
                  ) : (
                    <span className="flex-1 min-w-0 flex items-center justify-between gap-4 px-4 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{project.name}</span>
                        <span className="block text-xs truncate">{project.path}</span>
                      </span>
                      <span className="text-xs shrink-0">
                        {t('landing.recentProjects.folderNotFound')}
                      </span>
                    </span>
                  )}
                  <button
                    onClick={() => void removeRecentProject(project)}
                    aria-label={t('landing.recentProjects.removeLabel', { name: project.name })}
                    className="shrink-0 text-xs px-2 py-1 rounded border border-neutral-bdr bg-white text-neutral-dk hover:bg-neutral-50"
                  >
                    {t('landing.recentProjects.remove')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {quickProjects.length > 0 && (
          <section aria-labelledby="quick-recordings" className="w-full max-w-xl mb-8">
            <h2 id="quick-recordings" className="text-lg font-semibold text-neutral-dark">
              {t('landing.quickRecordings.title')}
            </h2>
            <p className="text-sm text-neutral-md mb-3">{t('landing.quickRecordings.hint')}</p>
            <ul className="border border-neutral-bdr rounded-lg bg-white shadow-card divide-y divide-neutral-bdr">
              {quickProjects.map((project) => (
                <li key={project.path}>
                  <Tooltip
                    content={t('tooltips.landing.quickRecording')}
                    position="top"
                    className="w-full"
                  >
                    <button
                      onClick={() => openQuickProject(project)}
                      className="w-full flex items-center justify-between gap-4 px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                    >
                      <span className="font-medium text-neutral-dark truncate">{project.name}</span>
                      <span className="text-xs text-neutral-md shrink-0">
                        {t('landing.quickRecordings.changed', {
                          date: new Date(project.modifiedAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })
                        })}
                      </span>
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {quickRecordOpen && <QuickRecordDialog onClose={() => setQuickRecordOpen(false)} />}

      {helpOpen && (
        <InformationModal
          title={t('help.landing.title')}
          message={t('help.landing.message')}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  )
}

export default Landing
