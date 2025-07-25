import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useProjectStore from '@foundation/Stores/projectStore'
import ProjectSettings from '@pages/ProjectSettings'
import RecordingSettings from '@pages/RecorderSettings'
import NoProjectLoadedMessage from '@components/NoProjectLoadedMessage'
import GeneralSettings from '@pages/GeneralSettings'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('general')
  const projectPath = useProjectStore((state) => state.projectPath)

  return (
    <div className="flex flex-col w-screen p-8 font-sans">
      <div className="relative w-full">
        <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
        <div className="relative h-[80vh] border rounded-lg shadow-sm overflow-y-auto bg-white z-10 p-4">
          <div className="flex border-b">
            <button
              className={`py-2 px-4 ${
                activeTab === 'general'
                  ? 'border-b-2 border-blue-500 font-semibold'
                  : 'text-gray-600'
              }`}
              onClick={() => setActiveTab('general')}
            >
              {t('settings.tabs.general')}
            </button>
            <button
              className={`py-2 px-4 ${
                activeTab === 'project'
                  ? 'border-b-2 border-blue-500 font-semibold'
                  : 'text-gray-600'
              }`}
              onClick={() => setActiveTab('project')}
            >
              {t('settings.tabs.project')}
            </button>
            <button
              className={`py-2 px-4 ${
                activeTab === 'recording'
                  ? 'border-b-2 border-blue-500 font-semibold'
                  : 'text-gray-600'
              }`}
              onClick={() => setActiveTab('recording')}
            >
              {t('settings.tabs.recording')}
            </button>
          </div>
          <div className="pt-4">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'project' &&
              (projectPath ? <ProjectSettings /> : <NoProjectLoadedMessage />)}
            {activeTab === 'recording' && <RecordingSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
