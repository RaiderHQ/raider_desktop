import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import SegmentedControl from '@components/SegmentedControl'
import type { ProjectLayout } from '@shared/types/projectLayout'
import type {
  DeviceEdit,
  DeviceFields,
  DeviceSettings as DeviceSettingsData
} from '@shared/types/deviceSettings'

type Platform = 'ios' | 'android'
type EditableField = keyof DeviceEdit
type Drafts = Partial<Record<Platform, Required<DeviceEdit>>>

interface Group {
  block: 'top' | 'ios' | 'android'
  platform: Platform
  fields: DeviceFields
}

interface DeviceSettingsProps {
  projectPath: string
  layout: ProjectLayout
  /** Set on the App file field of the platform that runs, or the heading when nothing can be read */
  focusRef?: React.Ref<HTMLElement>
}

const draftOf = ({ deviceName, platformVersion, app }: DeviceFields): Required<DeviceEdit> => ({
  deviceName,
  platformVersion,
  app
})

function groupsOf(settings: DeviceSettingsData): Group[] {
  if (settings.platform === 'cross_platform') {
    return (['ios', 'android'] as const).flatMap((platform) => {
      const fields = settings[platform]
      return fields ? [{ block: platform, platform, fields }] : []
    })
  }
  const fields = settings[settings.platform]
  return fields ? [{ block: 'top', platform: settings.platform, fields }] : []
}

const DeviceSettings: React.FC<DeviceSettingsProps> = ({ projectPath, layout, focusRef }) => {
  const { t } = useTranslation()
  const id = useId()
  const [settings, setSettings] = useState<DeviceSettingsData | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({})
  const [readError, setReadError] = useState(false)
  const [appMissing, setAppMissing] = useState(false)
  // Latest-request-wins tokens, so a slow answer for an earlier project or edit never lands
  const loadRef = useRef(0)
  const checkRef = useRef(0)

  // Only a missing app counts here; Appium being down or a failed check isn't this section's concern
  const checkApp = useCallback(async (): Promise<void> => {
    const token = ++checkRef.current
    try {
      const result = await window.api.checkMobileReady(projectPath)
      if (token !== checkRef.current) return
      setAppMissing('ok' in result && !result.ok && result.reason === 'app')
    } catch {
      if (token === checkRef.current) setAppMissing(false)
    }
  }, [projectPath])

  useEffect(() => {
    const token = ++loadRef.current
    setSettings(null)
    setDrafts({})
    setReadError(false)
    setAppMissing(false)
    if (!layout.mobilePlatform) {
      setReadError(true)
      return
    }
    const load = async (): Promise<void> => {
      try {
        const result = await window.api.getDeviceSettings(projectPath)
        if (token !== loadRef.current) return
        if ('error' in result) {
          setReadError(true)
          return
        }
        setSettings(result)
        setDrafts(
          Object.fromEntries(groupsOf(result).map((g) => [g.platform, draftOf(g.fields)]))
        )
      } catch {
        if (token === loadRef.current) setReadError(true)
      }
    }
    void load()
    void checkApp()
  }, [projectPath, layout.mobilePlatform, checkApp])

  const setDraft = (platform: Platform, field: EditableField, value: string): void => {
    setDrafts((current) => {
      const draft = current[platform]
      return draft ? { ...current, [platform]: { ...draft, [field]: value } } : current
    })
  }

  /** True when the value was saved; an empty or unchanged one never is */
  const saveField = async (group: Group, field: EditableField, raw: string): Promise<boolean> => {
    const value = raw.trim()
    if (!value || value === group.fields[field]) return false
    try {
      const result = await window.api.saveDeviceSettings(projectPath, {
        block: group.block,
        edit: { [field]: value }
      })
      if ('error' in result) {
        toast.error(t('device.saveFailed'))
        return false
      }
      setSettings((current) => {
        const fields = current?.[group.platform]
        return current && fields
          ? { ...current, [group.platform]: { ...fields, [field]: value } }
          : current
      })
      toast.success(t('device.saved'))
      return true
    } catch {
      toast.error(t('device.saveFailed'))
      return false
    }
  }

  const saveApp = async (group: Group, raw: string): Promise<void> => {
    if (await saveField(group, 'app', raw)) void checkApp()
  }

  const handleChoose = async (group: Group): Promise<void> => {
    try {
      const result = await window.api.chooseAppFile(projectPath, group.platform)
      if ('cancelled' in result) return
      if ('error' in result) {
        toast.error(t('device.saveFailed'))
        return
      }
      setDraft(group.platform, 'app', result.path)
      await saveField(group, 'app', result.path)
      // The same path picked again may now exist, so check even when nothing was saved
      void checkApp()
    } catch {
      toast.error(t('device.saveFailed'))
    }
  }

  const handleRunOn = async (runOn: Platform): Promise<void> => {
    if (!settings || settings.runOn === runOn) return
    const previous = settings.runOn
    setSettings({ ...settings, runOn })
    try {
      const result = await window.api.saveDeviceSettings(projectPath, { runOn })
      if ('error' in result) throw new Error(result.error)
      toast.success(t('device.saved'))
      // A run now needs the other platform's app file
      void checkApp()
    } catch {
      setSettings((current) => (current ? { ...current, runOn: previous } : current))
      toast.error(t('device.saveFailed'))
    }
  }

  const active: Platform | null = settings
    ? settings.platform === 'cross_platform'
      ? (settings.runOn ?? 'ios')
      : settings.platform
    : null
  const groups = settings ? groupsOf(settings) : []
  const crossPlatform = settings?.platform === 'cross_platform'

  const renderField = (
    group: Group,
    field: 'deviceName' | 'platformVersion',
    label: string,
    help: string
  ): React.ReactElement => {
    const inputId = `${id}-${group.platform}-${field}`
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-neutral-dk whitespace-nowrap">
          {label}
        </label>
        <input
          type="text"
          id={inputId}
          value={drafts[group.platform]?.[field] ?? ''}
          onChange={(e) => setDraft(group.platform, field, e.target.value)}
          onBlur={(e) => void saveField(group, field, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveField(group, field, e.currentTarget.value)
          }}
          aria-describedby={`${inputId}-help`}
          className="border border-neutral-bdr rounded px-2 py-1 text-sm w-48"
          data-testid={`device-${group.platform}-${field}`}
        />
        <span id={`${inputId}-help`} className="text-xs text-neutral-mid max-w-[12rem]">
          {help}
        </span>
      </div>
    )
  }

  const renderGroup = (group: Group): React.ReactElement => {
    const appId = `${id}-${group.platform}-app`
    const isActive = group.platform === active
    const missing = isActive && appMissing && group.fields.app !== ''
    const fields = (
      <div className="flex items-start gap-4 flex-wrap">
        {renderField(group, 'deviceName', t('device.deviceName'), t('device.help.deviceName'))}
        {renderField(group, 'platformVersion', t('device.osVersion'), t('device.help.osVersion'))}
        <div className="flex flex-col gap-1 flex-1 min-w-[16rem]">
          <label htmlFor={appId} className="text-sm font-medium text-neutral-dk whitespace-nowrap">
            {t('device.appFile')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              id={appId}
              ref={isActive ? (focusRef as React.Ref<HTMLInputElement>) : undefined}
              value={drafts[group.platform]?.app ?? ''}
              onChange={(e) => setDraft(group.platform, 'app', e.target.value)}
              onBlur={(e) => void saveApp(group, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveApp(group, e.currentTarget.value)
              }}
              aria-invalid={missing || undefined}
              aria-describedby={missing ? `${appId}-missing` : undefined}
              className={`flex-1 border rounded px-2 py-1 text-sm ${
                missing ? 'border-ruby' : 'border-neutral-bdr'
              }`}
              data-testid={`device-${group.platform}-app`}
            />
            <button
              type="button"
              onClick={() => void handleChoose(group)}
              className="px-3 py-1 text-sm font-medium text-neutral-dk border border-neutral-bdr rounded hover:bg-neutral-lt transition-colors"
              data-testid={`device-${group.platform}-choose`}
            >
              {t('device.choose')}
            </button>
          </div>
          {missing && (
            <span id={`${appId}-missing`} className="text-xs text-ruby">
              {t('device.fileMissing')}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-dk">{t('device.driver')}</span>
          <span className="text-sm text-neutral-dk py-1">{group.fields.automationName}</span>
        </div>
      </div>
    )
    if (!crossPlatform) return <div key={group.platform}>{fields}</div>
    return (
      <fieldset key={group.platform} className="border-t border-neutral-bdr pt-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-neutral-dk pr-2">
          {t(`device.${group.platform}`)}
        </legend>
        {fields}
      </fieldset>
    )
  }

  return (
    <section className="space-y-2" data-testid="device-settings">
      <h3
        ref={readError ? (focusRef as React.Ref<HTMLHeadingElement>) : undefined}
        tabIndex={readError ? -1 : undefined}
        className="text-sm font-semibold text-neutral-dark focus:outline-none"
      >
        {t('device.title')}
      </h3>
      {readError ? (
        <p className="text-sm text-neutral-dk">{t('device.readError')}</p>
      ) : (
        settings && (
          <>
            {appMissing && (
              <p className="text-sm text-ruby" data-testid="device-choose-app-prompt">
                {t('device.chooseAppPrompt')}
              </p>
            )}
            {crossPlatform && active && (
              <SegmentedControl
                label={t('device.runOn')}
                options={[
                  { value: 'ios', label: t('device.ios') },
                  { value: 'android', label: t('device.android') }
                ]}
                value={active}
                onChange={(runOn) => void handleRunOn(runOn)}
                testId="device-run-on"
              />
            )}
            {groups.map(renderGroup)}
          </>
        )
      )}
    </section>
  )
}

export default DeviceSettings
