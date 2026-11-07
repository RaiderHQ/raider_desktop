import React from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'

interface TagChipsProps {
  tags: string[]
}

/** A code-owned test's tags: shown, not editable (they live on the describe line). */
const TagChips: React.FC<TagChipsProps> = ({ tags }) => {
  const { t } = useTranslation()
  if (tags.length === 0) return null
  return (
    <Tooltip content={t('tooltips.testPage.tagsReadOnly')} position="bottom">
      <ul className="flex flex-wrap gap-1.5" aria-label={t('testPage.tags.label')}>
        {tags.map((tag) => (
          <li
            key={tag}
            className="px-2 py-0.5 bg-neutral-lt border border-neutral-bdr rounded-md text-sm text-neutral-dk"
          >
            {tag}
          </li>
        ))}
      </ul>
    </Tooltip>
  )
}

export default TagChips
