import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import ConfirmationModal from '@components/ConfirmationModal'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { showErrorToast } from '@foundation/errorToast'
import { create } from 'zustand'

// Shared across mounts: the Tests tab unmounts this pane while the Files tab shows, and the
// button must stay disabled until main has answered
const useUpdating = create<{ project: string | null }>(() => ({ project: null }))

/**
 * The Tests tab of a project locked to a ruby_raider below 4.0: what is wrong, the fix,
 * and a button that applies it after confirmation (pin to ~> 4.0, bundle update ruby_raider).
 */
const ProjectNeedsUpdate: React.FC = () => {
  const { t } = useTranslation()
  const projectPath = useProjectStore((s) => s.projectPath)
  const version = useProjectStore((s) => s.layout?.rubyRaiderVersion)
  const rubyCommand = useRubyStore((s) => s.rubyCommand)
  const [confirming, setConfirming] = useState(false)
  const updating = useUpdating((s) => s.project !== null && s.project === projectPath)

  const update = async (): Promise<void> => {
    setConfirming(false)
    if (!projectPath || !rubyCommand) {
      toast.error(t('recorder.noRuby'))
      return
    }
    useUpdating.setState({ project: projectPath })
    try {
      const result = await window.api.upgradeRubyRaider(projectPath, rubyCommand)
      // The answer is about the project that was open when the update started
      if (useProjectStore.getState().projectPath !== projectPath) return
      if (!result.success) {
        // After bundle ran the Gemfile already pins 4.0; before, nothing changed
        const summary =
          result.output !== undefined ? 'projectUpdate.failedRepinned' : 'projectUpdate.failed'
        showErrorToast(t(summary), result.error)
        // Main may have closed the project when its reload failed: ask it again, so the
        // renderer shows what main has (and the activation error, if it repeats)
        if (result.output !== undefined) useProjectStore.getState().setProjectPath(projectPath)
        return
      }
      if (result.layout) useProjectStore.setState({ layout: result.layout })
      toast.success(t('projectUpdate.done'))
    } catch (error) {
      showErrorToast(t('projectUpdate.failed'), String(error))
    } finally {
      useUpdating.setState({ project: null })
    }
  }

  const folder = projectPath?.split(/[\\/]/).filter(Boolean).pop() ?? ''

  return (
    <div
      role="alert"
      data-testid="project-needs-update"
      className="flex flex-col gap-3 m-6 p-4 border border-neutral-bdr rounded-md bg-white max-w-xl"
    >
      <h2 className="text-base font-semibold text-neutral-dark">{t('projectUpdate.title')}</h2>
      <p className="text-sm text-neutral-dk">
        {version ? t('projectUpdate.message', { version }) : t('projectUpdate.messageUnknown')}
      </p>
      <div>
        <Button onClick={() => setConfirming(true)} type="primary" disabled={updating}>
          {updating ? t('projectUpdate.updating') : t('projectUpdate.button')}
        </Button>
      </div>
      {confirming && (
        <ConfirmationModal
          title={t('projectUpdate.confirmTitle')}
          message={t('projectUpdate.confirmMessage', { project: folder })}
          confirmLabel={t('projectUpdate.button')}
          onConfirm={() => void update()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

export default ProjectNeedsUpdate
