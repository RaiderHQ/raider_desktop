import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import InputField from '@components/InputField'
import Tooltip from '@components/Tooltip'
import { isValidInputName } from '@shared/types/step'

interface InputNameModalProps {
  /** The name the step already has; empty for a new input */
  initialName: string
  /** The recorded text: what runs type unless they give another value */
  defaultValue: string
  onSave: (name: string) => void
  onClose: () => void
}

const M = 'recorder.step.inputModal'

/**
 * Names a flow step's input. Only a valid name can be saved, since main refuses a step
 * with a bad one. Rendered at the end of the page, away from the draggable step card.
 */
const InputNameModal: React.FC<InputNameModalProps> = ({
  initialName,
  defaultValue,
  onSave,
  onClose
}) => {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const valid = isValidInputName(name)
  // Nothing typed yet is not an error; anything else that can't be saved says why
  const error = name !== '' && !valid ? t(`${M}.nameInvalid`) : undefined

  const save = (): void => {
    if (valid) onSave(name)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="input-name-modal-title"
        className="bg-white rounded-xl shadow-elevated w-full max-w-md"
      >
        <div className="px-6 py-4 border-b border-neutral-bdr">
          <h2 id="input-name-modal-title" className="text-lg font-semibold text-neutral-dark">
            {t(initialName ? `${M}.titleChange` : `${M}.titleNew`)}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          <InputField
            label={t(`${M}.nameLabel`)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            hint={t(`${M}.nameHint`)}
            error={error}
            tooltip={t('tooltips.steps.inputName')}
            autoFocus
          />
          <div>
            <p className="block text-xs font-semibold uppercase tracking-wider text-neutral-dk mb-1">
              {t(`${M}.defaultLabel`)}
            </p>
            <p
              data-testid="input-default"
              className="font-mono text-sm px-3 py-1 rounded bg-neutral-lt border border-neutral-bdr break-all"
            >
              {defaultValue}
            </p>
            <p className="mt-1 text-xs text-neutral-dk">{t(`${M}.defaultHelp`)}</p>
          </div>
        </div>

        <div className="border-t border-neutral-bdr px-6 py-4 flex justify-end space-x-2">
          <Tooltip content={t('tooltips.steps.inputCancel')} position="top">
            <Button type="secondary" onClick={onClose}>
              {t(`${M}.cancel`)}
            </Button>
          </Tooltip>
          <Tooltip
            content={t('tooltips.steps.inputSave')}
            disabledReason={valid ? undefined : t('tooltips.steps.inputSaveInvalid')}
            position="top"
          >
            <Button type="primary" onClick={save} disabled={!valid}>
              {t(`${M}.save`)}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default InputNameModal
