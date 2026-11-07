import toast from 'react-hot-toast'
import i18n from 'i18next'

/** Installs the gems Raider needs, showing how it went in one toast */
export async function installMissingGems(rubyCommand: string, gems: string[]): Promise<void> {
  const toastId = toast.loading(i18n.t('gems.toast.installing', { gems: gems.join(', ') }))
  try {
    const result = await window.api.installGems(rubyCommand, gems)
    if (result.success) {
      toast.success(i18n.t('gems.toast.installed'), { id: toastId })
    } else {
      toast.error(i18n.t('gems.toast.failed', { error: result.error }), { id: toastId })
    }
  } catch (error) {
    toast.error(i18n.t('gems.toast.error', { error: String(error) }), { id: toastId })
  }
}
