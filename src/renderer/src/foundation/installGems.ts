import toast from 'react-hot-toast'

/** Installs the gems Raider needs, showing how it went in one toast */
export async function installMissingGems(rubyCommand: string, gems: string[]): Promise<void> {
  const toastId = toast.loading(`Installing missing gems: ${gems.join(', ')}...`)
  try {
    const result = await window.api.installGems(rubyCommand, gems)
    if (result.success) {
      toast.success('Gems installed successfully!', { id: toastId })
    } else {
      toast.error(`Failed to install gems: ${result.error}`, { id: toastId })
    }
  } catch (error) {
    toast.error(`Error installing gems: ${error}`, { id: toastId })
  }
}
