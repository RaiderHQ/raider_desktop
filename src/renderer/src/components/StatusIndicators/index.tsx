import React from 'react'

type Status = 'pass' | 'fail' | 'idle'

interface StatusProps {
  status: Status
}

const statusColors: Record<Status, { text: string; bg: string }> = {
  pass: { text: 'text-status-ok', bg: 'bg-status-ok-bg' },
  fail: { text: 'text-status-err', bg: 'bg-status-err-bg' },
  idle: { text: 'text-neutral-mid', bg: 'bg-neutral-lt' }
}

export const StatusPill: React.FC<StatusProps> = ({ status }) => {
  const { text, bg } = statusColors[status]
  return (
    <span
      className={`inline-block text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-md flex-shrink-0 ${text} ${bg}`}
    >
      {status}
    </span>
  )
}

const dotColors: Record<Status, string> = {
  pass: 'bg-status-ok',
  fail: 'bg-status-err',
  idle: 'bg-neutral-mid'
}

export const StatusDot: React.FC<StatusProps> = ({ status }) => (
  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[status]}`} />
)
