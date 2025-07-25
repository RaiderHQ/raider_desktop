import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ProjectDashboard from '@components/ProjectDashboard'
import RecordingDashboard from '@components/RecordingDashboard'
import useRunOutputStore from '@foundation/Stores/runOutputStore'

const Dashboard: React.FC = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('project')
  const { runOutput } = useRunOutputStore()

  return (
    <div className="flex flex-col w-screen p-8 font-sans">
      <div className="relative w-full">
        <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
        <div className="relative h-[80vh] border rounded-lg shadow-sm overflow-y-auto bg-white z-10 p-4">
          <div className="flex border-b">
            <button
              className={`py-2 px-4 ${
                activeTab === 'project'
                  ? 'border-b-2 border-blue-500 font-semibold'
                  : 'text-gray-600'
              }`}
              onClick={() => setActiveTab('project')}
            >
              {t('dashboard.tabs.project')}
            </button>
            <button
              className={`py-2 px-4 ${
                activeTab === 'recording'
                  ? 'border-b-2 border-blue-500 font-semibold'
                  : 'text-gray-600'
              }`}
              onClick={() => setActiveTab('recording')}
            >
              {t('dashboard.tabs.recording')}
            </button>
          </div>
          <div className="pt-4">
            {activeTab === 'project' && <ProjectDashboard />}
            {activeTab === 'recording' && <RecordingDashboard runOutput={runOutput} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
