import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import InformationModal from '@components/InformationModal'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'

const OpenProject: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const setLoading: (loading: boolean) => void = useLoadingStore(
    (state: { setLoading: (loading: boolean) => void }) => state.setLoading
  )
  const setProjectPath: (path: string) => void = useProjectStore(
    (state: { setProjectPath: (path: string) => void }) => state.setProjectPath
  )
  const [isModalOpen, setModalOpen] = useState(false)

  const handleOpenProject = async (): Promise<void> => {
    setLoading(true)

    try {
      const folder = await window.api.selectFolder('Select a folder to open your project')
      if (!folder) {
        setLoading(false)
        return
      }

      const { success } = await window.api.checkConfig(folder)
      if (!success) {
        alert('Invalid project folder selected. Please choose a valid Raider project folder.')
        setLoading(false)
        return
      }

      const files = await window.api.readDirectory(folder)
      setProjectPath(folder)
      navigate('/project/overview', { state: { files } })
    } catch (error) {
      console.error('Error opening project:', error)
      alert('An error occurred while opening the project. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">{t('openProject.title')}</h1>
        <p className="text-gray-600">{t('openProject.subtitle')}</p>
      </div>

      <ContentArea>
        <div className="bg-white p-8">
          <div className={`flex justify-center space-x-4`}>
            <Button onClick={() => navigate(-1)} type="secondary">
              {t('button.back.text')}
            </Button>
            <Button onClick={handleOpenProject} type="primary">
              {t('button.open.text')}
            </Button>
          </div>
        </div>
      </ContentArea>

      {isModalOpen && (
        <InformationModal
          title={t('information.open.title')}
          message={t('information.open.message')}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

export default OpenProject
