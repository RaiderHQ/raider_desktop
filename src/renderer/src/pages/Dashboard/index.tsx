import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ProjectDashboard from '@components/ProjectDashboard'
import RecordingDashboard from '@components/RecordingDashboard'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useSuiteSync } from '../../hooks/useRecorderIPC'

const Dashboard: React.FC = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('project')
  const { runOutput } = useRunOutputStore()

  // Ensure recorder store suites are loaded so dashboards can look up hasTrace
  useSuiteSync()

  return (
    <div className="flex flex-col w-screen p-8 font-sans">
      <div className="relative w-full">
        <div className="relative h-[80vh] border border-neutral-bdr rounded-lg shadow-card overflow-y-auto bg-white p-4">
          <div className="flex border-b border-neutral-bdr">
            <button
              className={`py-2 px-4 transition-colors ${
                activeTab === 'project'
                  ? 'border-b-2 border-ruby font-semibold text-neutral-dark'
                  : 'text-neutral-mid hover:text-neutral-dk'
              }`}
              onClick={() => setActiveTab('project')}
            >
              {t('dashboard.tabs.project')}
            </button>
            <button
              className={`py-2 px-4 transition-colors ${
                activeTab === 'recording'
                  ? 'border-b-2 border-ruby font-semibold text-neutral-dark'
                  : 'text-neutral-mid hover:text-neutral-dk'
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
