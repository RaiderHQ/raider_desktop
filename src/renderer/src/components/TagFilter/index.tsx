import React from 'react'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'
import type { TestRow } from '@foundation/testKey'

interface TagFilterProps {
  rows: TestRow[]
  /** The tag whose tests are listed; null means all tests. */
  value: string | null
  onChange: (tag: string | null) => void
}

/** Picks a tag to narrow the Tests list to; absent while no test has a tag. */
const TagFilter: React.FC<TagFilterProps> = ({ rows, value, onChange }) => {
  const { t } = useTranslation()
  const tags = [...new Set(rows.flatMap((r) => r.tags))].sort()
  if (tags.length === 0) return null
  return (
    <Tooltip content={t('tooltips.tests.tagFilter')} position="bottom">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={t('tests.tagFilter.label')}
        data-testid="tag-filter"
        className="h-7 min-w-0 max-w-[8rem] border border-neutral-bdr rounded pl-2.5 pr-7 text-xs bg-white"
      >
        <option value="">{t('tests.tagFilter.all')}</option>
        {tags.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>
    </Tooltip>
  )
}

export default TagFilter
