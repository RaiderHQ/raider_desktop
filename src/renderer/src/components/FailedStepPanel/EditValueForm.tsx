import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import { editableValue, withValue } from '@shared/stepFixes'
import type { Step } from '@shared/types/step'

interface EditValueFormProps {
  step: Step
  /** What the page showed instead, when the failure said */
  actualValue?: string
  onSave(step: Step): void
  onCancel(): void
}

/** Corrects the value a failed step typed, expected or visited. */
const EditValueForm: React.FC<EditValueFormProps> = ({ step, actualValue, onSave, onCancel }) => {
  const { t } = useTranslation()
  const original = editableValue(step) ?? ''
  const [value, setValue] = useState(original)
  // Nothing changed: there is nothing to save
  const submit = (): void => (value === original ? onCancel() : onSave(withValue(step, value)))

  return (
    <div
      data-testid="edit-value-form"
      className="my-1 ml-6 rounded border border-neutral-bdr bg-white p-2 space-y-2"
    >
      {step.kind === 'assert' && actualValue !== undefined && (
        <div className="flex items-center gap-2 text-sm text-neutral-dark">
          <span>{t('failedStep.pageShowed', { actual: actualValue })}</span>
          <button
            type="button"
            className="text-xs font-medium text-ruby hover:underline"
            onClick={() => setValue(actualValue)}
          >
            {t('failedStep.useThis')}
          </button>
        </div>
      )}
      <input
        aria-label={t('failedStep.value')}
        className="block w-full px-3 py-1 border border-neutral-bdr rounded text-sm focus:ring-ruby focus:border-ruby"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex gap-2">
        <Button type="primary" className="min-w-0 !px-3 !py-1" onClick={submit}>
          {t('failedStep.save')}
        </Button>
        <Button type="secondary" className="min-w-0 !px-3 !py-1" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}

export default EditValueForm
