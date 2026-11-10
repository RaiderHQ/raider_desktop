import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import Checkbox from '@components/Checkbox'
import InputField from '@components/InputField'
import Tooltip from '@components/Tooltip'
import { useRunStore } from '@foundation/Stores/runStore'
import { flowFile } from '@shared/flows'
import type { FlowInput } from '@shared/types/projectTest'
import FlowModal from './FlowModal'
import { inputErrors } from '../Schedules/scheduleText'

interface RunFlowModalProps {
  name: string
  title: string
  inputs: FlowInput[]
  onClose: () => void
}

/** Starts a flow run in the run panel. */
export const runFlow = (
  name: string,
  title: string,
  inputs: Record<string, string>,
  headed: boolean
): Promise<'started' | 'busy' | 'error'> =>
  useRunStore
    .getState()
    .start(
      { kind: 'files', files: [flowFile(name)] },
      { route: '/overview', label: title },
      { name, inputs, headed }
    )

/** Run…: one field per input (the recorded value first) and whether to show the browser. */
const RunFlowModal: React.FC<RunFlowModalProps> = ({ name, title, inputs, onClose }) => {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map((i) => [i.name, i.default]))
  )
  const [headed, setHeaded] = useState(false)
  const [starting, setStarting] = useState(false)
  // A second click before the re-render must not start a second run
  const inFlight = useRef(false)
  const errors = inputErrors(values)
  const valid = Object.keys(errors).length === 0

  const run = async (): Promise<void> => {
    if (!valid || inFlight.current) return
    inFlight.current = true
    setStarting(true)
    try {
      const result = await runFlow(name, title, values, headed)
      if (result === 'started') onClose()
    } finally {
      inFlight.current = false
      setStarting(false)
    }
  }

  return (
    <FlowModal
      title={t('flows.runModal.title', { name: title })}
      onClose={onClose}
      footer={
        <>
          <Tooltip content={t('tooltips.flows.cancel')} position="top">
            <Button type="secondary" onClick={onClose}>
              {t('flows.cancel')}
            </Button>
          </Tooltip>
          <Tooltip
            content={t('tooltips.flows.runNow')}
            disabledReason={valid ? undefined : t('tooltips.flows.fixInputs')}
            position="top"
          >
            <Button type="primary" onClick={() => void run()} disabled={!valid || starting}>
              {t('flows.runModal.run')}
            </Button>
          </Tooltip>
        </>
      }
    >
      {inputs.map((input) => (
        <InputField
          key={input.name}
          label={input.name}
          value={values[input.name] ?? ''}
          onChange={(e) => setValues({ ...values, [input.name]: e.target.value })}
          error={errors[input.name]}
          tooltip={t('tooltips.flows.inputValue')}
        />
      ))}
      <Checkbox
        label={t('flows.runModal.showBrowser')}
        checked={headed}
        onChange={setHeaded}
        tooltip={t('tooltips.flows.showBrowser')}
      />
    </FlowModal>
  )
}

export default RunFlowModal
