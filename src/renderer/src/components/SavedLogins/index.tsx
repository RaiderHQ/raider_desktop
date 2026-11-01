import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import ConfirmationModal from '@components/ConfirmationModal'
import type { SavedLogin, SavedLoginsResult } from '@shared/types/savedLogins'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "2 days ago", using the largest unit of minutes, hours or days; null when the date is unusable */
const ageOf = (savedAt: string | null): string | null => {
  if (!savedAt) return null
  const saved = Date.parse(savedAt)
  if (Number.isNaN(saved)) return null
  const elapsed = Math.max(0, Date.now() - saved)
  if (elapsed < HOUR_MS) return relativeFormat.format(-Math.floor(elapsed / MINUTE_MS), 'minute')
  if (elapsed < DAY_MS) return relativeFormat.format(-Math.floor(elapsed / HOUR_MS), 'hour')
  return relativeFormat.format(-Math.floor(elapsed / DAY_MS), 'day')
}

const hostOf = (origin: string | null): string | null => {
  if (!origin) return null
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

const SavedLogins: React.FC = () => {
  const { t } = useTranslation()
  const projectPath = useProjectStore((s) => s.projectPath)
  // A finished run of this project can save or refresh a login, so the list reloads
  const lastRunFinishedAt = useRunStore((s) =>
    s.run && s.run.projectPath === projectPath ? (s.run.finished?.finishedAt ?? null) : null
  )
  const [data, setData] = useState<SavedLoginsResult | null>(null)
  const [pendingForget, setPendingForget] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setData(await window.api.listSavedLogins())
    } catch {
      setData({ logins: [], gemSupportsLogins: true })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, projectPath, lastRunFinishedAt])

  const confirmForget = async (): Promise<void> => {
    const name = pendingForget
    setPendingForget(null)
    if (!name) return
    const outcome = await window.api.forgetSavedLogin(name)
    if ('error' in outcome) toast.error(outcome.error)
    await load()
  }

  const renderRow = (login: SavedLogin): JSX.Element => {
    const host = hostOf(login.origin)
    const age = ageOf(login.savedAt)
    return (
      <li
        key={login.name}
        data-testid="saved-login-row"
        className="flex items-center gap-3 px-4 py-2.5"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-dark truncate">{login.name}</p>
          <div className="flex items-center gap-2 text-xs text-neutral-mid">
            {login.known ? (
              <>
                {host && <span>{host}</span>}
                {age && <span>{t('logins.saved', { age })}</span>}
              </>
            ) : (
              <span>{t('logins.unknownFormat')}</span>
            )}
          </div>
        </div>
        {login.known && login.expired && (
          <span
            data-testid="saved-login-expired"
            title={t(login.expiredReason === 'site' ? 'logins.expiredSite' : 'logins.expiredAge')}
            className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700"
          >
            {t('logins.expired')}
          </span>
        )}
        <button
          type="button"
          data-testid="saved-login-forget"
          onClick={() => setPendingForget(login.name)}
          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-neutral-bdr text-neutral-dk hover:bg-neutral-100"
        >
          {t('logins.forget')}
        </button>
      </li>
    )
  }

  if (!data) return null

  return (
    <div className="border border-neutral-bdr rounded-lg bg-white">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-neutral-mid uppercase tracking-wide">
        {t('logins.title')}
      </p>
      {data.logins.length === 0 ? (
        <div className="px-4 pb-4 text-xs text-neutral-mid">
          <p>{t('logins.empty')}</p>
          {!data.gemSupportsLogins && <p className="mt-1">{t('logins.updateGem')}</p>}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-bdr">{data.logins.map(renderRow)}</ul>
      )}
      {pendingForget && (
        <ConfirmationModal
          title={t('logins.forget')}
          message={t('logins.forgetConfirm', { name: pendingForget })}
          confirmLabel={t('logins.forget')}
          cancelLabel={t('common.cancel')}
          onConfirm={confirmForget}
          onCancel={() => setPendingForget(null)}
        />
      )}
    </div>
  )
}

export default SavedLogins
