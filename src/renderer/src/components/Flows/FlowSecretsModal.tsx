import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import ConfirmationModal from '@components/ConfirmationModal'
import InputField from '@components/InputField'
import Tooltip from '@components/Tooltip'
import { isFlowSecretKey } from '@shared/flows'
import type { FlowEnvError, FlowEnvKeys } from '@shared/types/flows'
import FlowModal from './FlowModal'

interface FlowSecretsModalProps {
  onClose: () => void
}

const rowButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium'

/**
 * Secrets…: the keys in .raider/flows/env, with add or replace and remove. A value goes to
 * main and is never shown again: main answers with key names only.
 */
const FlowSecretsModal: React.FC<FlowSecretsModalProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<string[] | null>(null)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(
    () => (): void => {
      mounted.current = false
    },
    []
  )

  const failed = (result: FlowEnvError): void => {
    toast.error(t(`flows.secrets.error.${result.error}`))
  }

  const apply = (result: FlowEnvKeys | FlowEnvError): boolean => {
    if ('error' in result) {
      failed(result)
      return false
    }
    if (mounted.current) setKeys(result.keys)
    return true
  }

  useEffect(() => {
    window.api
      .listFlowEnvKeys()
      .then((result) => {
        if (mounted.current) apply(result)
      })
      .catch(() => toast.error(t('flows.secrets.error.io')))
    // Once, when the dialog opens
  }, [])

  const keyError = key === '' || isFlowSecretKey(key) ? undefined : t('flows.secrets.keyInvalid')
  const canSave = isFlowSecretKey(key) && value !== '' && !saving

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    try {
      if (apply(await window.api.setFlowEnv({ key, value }))) {
        toast.success(t('flows.secrets.saved', { key }))
        setKey('')
        setValue('')
      }
    } catch {
      toast.error(t('flows.secrets.error.io'))
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const remove = async (target: string): Promise<void> => {
    setRemoving(null)
    try {
      if (apply(await window.api.removeFlowEnv({ key: target })))
        toast.success(t('flows.secrets.removed', { key: target }))
    } catch {
      toast.error(t('flows.secrets.error.io'))
    }
  }

  return (
    <>
      <FlowModal
        title={t('flows.secrets.title')}
        // Esc while asking about a removal answers that question first
        onClose={removing ? (): void => setRemoving(null) : onClose}
        footer={
          <Tooltip content={t('tooltips.flows.secretsDone')} position="top">
            <Button type="secondary" onClick={onClose}>
              {t('flows.secrets.done')}
            </Button>
          </Tooltip>
        }
      >
        <p className="text-sm text-neutral-dk">{t('flows.secrets.explain')}</p>
        {keys !== null &&
          (keys.length === 0 ? (
            <p className="text-sm text-neutral-md">{t('flows.secrets.empty')}</p>
          ) : (
            <ul
              className="divide-y divide-neutral-bdr border border-neutral-bdr rounded"
              data-testid="secret-keys"
            >
              {keys.map((k) => (
                <li key={k} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-0 truncate font-mono text-sm text-neutral-dark">
                    {k}
                  </span>
                  <Tooltip content={t('tooltips.flows.secretRemove')} position="left">
                    <button
                      className={rowButton}
                      aria-label={t('flows.secrets.removeLabel', { key: k })}
                      onClick={() => setRemoving(k)}
                    >
                      {t('flows.secrets.remove')}
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          ))}
        <div className="space-y-3 pt-2">
          <InputField
            label={t('flows.secrets.keyLabel')}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            hint={t('flows.secrets.keyHint')}
            error={keyError}
            tooltip={t('tooltips.flows.secretKey')}
          />
          <InputField
            label={t('flows.secrets.valueLabel')}
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            hint={keys?.includes(key) ? t('flows.secrets.replaceHint', { key }) : undefined}
            tooltip={t('tooltips.flows.secretValue')}
          />
          <div className="flex justify-end">
            <Tooltip
              content={t('tooltips.flows.secretSave')}
              disabledReason={canSave ? undefined : t('tooltips.flows.secretIncomplete')}
              position="top"
            >
              <Button type="primary" onClick={() => void save()} disabled={!canSave}>
                {t('flows.secrets.save')}
              </Button>
            </Tooltip>
          </div>
        </div>
      </FlowModal>
      {removing &&
        // After the dialog in the page, so it sits on top of it
        ReactDOM.createPortal(
          <ConfirmationModal
            title={t('flows.secrets.removeConfirm.title')}
            message={t('flows.secrets.removeConfirm.message')}
            subject={removing}
            confirmLabel={t('flows.secrets.removeConfirm.confirm')}
            cancelLabel={t('flows.cancel')}
            onConfirm={() => void remove(removing)}
            onCancel={() => setRemoving(null)}
          />,
          document.body
        )}
    </>
  )
}

export default FlowSecretsModal
