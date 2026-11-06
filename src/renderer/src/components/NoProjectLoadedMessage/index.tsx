import React from 'react'
import { useTranslation } from 'react-i18next'
import DocsLink from '@components/DocsLink'

const NoProjectLoadedMessage: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">{t('settings.noProject.title')}</h1>
        <p className="text-lg">{t('settings.noProject.description')}</p>
        <DocsLink id="docs.projects" topic={t('docs.topics.projects')} className="mt-2">
          {t('docs.howProjectsWork')}
        </DocsLink>
      </div>
    </div>
  )
}

export default NoProjectLoadedMessage
