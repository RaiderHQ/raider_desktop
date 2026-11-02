import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SnapshotData } from '@foundation/trace/viewModel'
import { sanitizeSnapshot } from '@foundation/trace/sanitizeSnapshot'

interface TraceSnapshotFrameProps {
  snapshot: SnapshotData
}

// Sanitising is slow, so each loaded snapshot is sanitised once. The view
// model hands back the same object for the same trace entry, and a new trace
// gives new objects, so this can't serve one trace's page for another.
const cache = new WeakMap<SnapshotData, string>()
const sanitized = (snapshot: SnapshotData): string => {
  let html = cache.get(snapshot)
  if (html === undefined) {
    html = sanitizeSnapshot(snapshot.text)
    cache.set(snapshot, html)
  }
  return html
}

// The page HTML is untrusted, so it is sanitised here (only when shown) and
// rendered with an empty sandbox: no scripts, no same origin, no forms, no
// popups, no navigation. Mobile XML is shown as text.
const TraceSnapshotFrame: React.FC<TraceSnapshotFrameProps> = ({ snapshot }) => {
  const { t } = useTranslation()
  const { kind, text } = snapshot
  const srcDoc = useMemo(() => (kind === 'html' ? sanitized(snapshot) : ''), [kind, snapshot])

  if (kind === 'xml') {
    return (
      <pre className="text-xs bg-neutral-lt p-2 rounded border border-neutral-bdr overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">
        {text}
      </pre>
    )
  }
  return (
    <iframe
      data-testid="trace-snapshot"
      title={t('traceViewer.view.snapshot')}
      sandbox=""
      srcDoc={srcDoc}
      referrerPolicy="no-referrer"
      className="w-full h-[60vh] rounded-lg border border-neutral-bdr bg-white"
    />
  )
}

export default TraceSnapshotFrame
