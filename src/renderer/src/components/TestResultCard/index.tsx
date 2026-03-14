import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationCircle,
  FaChevronRight,
  FaChevronDown,
  FaImage,
  FaTimes,
  FaRoute,
  FaExclamationTriangle,
  FaExternalLinkAlt
} from 'react-icons/fa'
import toast from 'react-hot-toast'

interface A11yNode {
  selector: string
  html: string
  fix: string
}

interface A11yViolation {
  id: string
  description: string
  severity: string
  helpUrl: string
  nodes: A11yNode[]
}

function parseA11yMessage(msg: string): A11yViolation[] | null {
  if (!msg.includes('accessibility violation')) return null
  const violations: A11yViolation[] = []
  const ruleBlocks = msg.split(/\d+\)\s+/).slice(1)
  for (const block of ruleBlocks) {
    const headerMatch = block.match(/^(\S+):\s*(.+?)\s*\((\w+)\)\s*(https?:\/\/\S+)/)
    if (!headerMatch) continue
    const [, id, description, severity, helpUrl] = headerMatch
    const nodes: A11yNode[] = []
    const nodeBlocks = block.split(/Selector:\s+/).slice(1)
    for (const nb of nodeBlocks) {
      const selectorMatch = nb.match(/^(.+?)[\r\n]/)
      const htmlMatch = nb.match(/HTML:\s*(.+?)[\r\n]/)
      const fixMatch = nb.match(/Fix any of the following:\s*[\r\n]\s*-\s*(.+?)(?:[\r\n]|$)/)
      nodes.push({
        selector: selectorMatch?.[1]?.trim() || '',
        html: htmlMatch?.[1]?.trim() || '',
        fix: fixMatch?.[1]?.trim() || ''
      })
    }
    violations.push({ id, description, severity, helpUrl, nodes })
  }
  return violations.length > 0 ? violations : null
}

interface TestResultCardProps {
  name: string
  status: string
  screenshot?: string
  message?: string | null
  hasTrace?: boolean
  onViewTrace?: () => void
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  serious: 'bg-orange-100 text-orange-800 border-orange-300',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  minor: 'bg-blue-100 text-blue-800 border-blue-300'
}

const MessageContent: React.FC<{ message: string }> = ({ message }) => {
  const violations = parseA11yMessage(message)
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())

  if (!violations) {
    return <p className="mt-2 text-sm text-neutral-dk">{message}</p>
  }

  const totalNodes = violations.reduce((sum, v) => sum + v.nodes.length, 0)

  const toggleRule = (id: string): void => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-red-600">
        <FaExclamationTriangle />
        <span>
          {violations.length} violation{violations.length !== 1 ? 's' : ''} found ({totalNodes}{' '}
          element{totalNodes !== 1 ? 's' : ''} affected)
        </span>
      </div>
      {violations.map((v) => {
        const isExpanded = expandedRules.has(v.id)
        const severityClass = SEVERITY_COLORS[v.severity] || SEVERITY_COLORS.minor
        return (
          <div key={v.id} className="border rounded-md overflow-hidden">
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleRule(v.id)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              <span className="text-neutral-mid">
                {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
              </span>
              <span className={`px-1.5 py-0.5 text-xs font-medium rounded border ${severityClass}`}>
                {v.severity}
              </span>
              <span className="font-medium flex-1">{v.id}</span>
              <span className="text-neutral-mid text-xs">
                {v.nodes.length} element{v.nodes.length !== 1 ? 's' : ''}
              </span>
            </button>
            {isExpanded && (
              <div className="border-t px-3 py-2 space-y-2 bg-neutral-50/50">
                <p className="text-xs text-neutral-dk">{v.description}</p>
                <a
                  href={v.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ruby flex items-center gap-1 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Learn more <FaExternalLinkAlt className="text-[10px]" />
                </a>
                <div className="space-y-1.5">
                  {v.nodes.map((node, i) => (
                    <div key={i} className="text-xs border rounded p-2 bg-white">
                      <code className="block text-neutral-dk break-all">{node.selector}</code>
                      {node.fix && (
                        <p className="mt-1 text-neutral-mid">{node.fix}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const TestResultCard: React.FC<TestResultCardProps> = ({
  name,
  status,
  screenshot,
  message,
  hasTrace,
  onViewTrace
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [imageData, setImageData] = useState<string>('')

  let statusIcon: JSX.Element | null = null

  if (status === 'passed') {
    statusIcon = <FaCheckCircle className="text-status-ok" />
  } else if (status === 'failed') {
    statusIcon = <FaTimesCircle className="text-red-500" />
  } else if (status === 'skipped') {
    statusIcon = <FaExclamationCircle className="text-neutral-mid" />
  }

  const chevronIcon = open ? <FaChevronDown /> : <FaChevronRight />

  useEffect(() => {
    if (showModal && screenshot) {
      window.api
        .readImage(screenshot)
        .then((res: { success: boolean; data?: string; error?: string }) => {
          if (res.success && res.data) {
            const dataUrl = `data:image/png;base64,${res.data}`
            setImageData(dataUrl)
          } else {
            toast.error(`${t('testResults.error.imageRead')}: ${res.error}`)
          }
        })
        .catch(() => {
          toast.error(t('testResults.error.imageAccess'))
        })
    }
  }, [showModal, screenshot, t])

  return (
    <div className="p-4 border rounded shadow">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center">
          <div className="mr-2">{chevronIcon}</div>
          <h2 className="font-semibold">{name}</h2>
        </div>
        <div className="pl-4">{statusIcon}</div>
      </div>
      {open && (
        <div className="mt-2">
          <p>
            {t('testResults.status')}: {t(`testResults.${status}`)}
          </p>
          {message && <MessageContent message={message} />}
          <div className="flex gap-2 mt-2">
            {screenshot && (
              <button
                onClick={() => setShowModal(true)}
                className="text-ruby flex items-center"
              >
                <FaImage className="mr-1" />
                <span className="underline">{t('testResults.viewScreenshot')}</span>
              </button>
            )}
            {hasTrace && onViewTrace && (
              <button
                onClick={onViewTrace}
                className="text-ruby flex items-center"
              >
                <FaRoute className="mr-1" />
                <span className="underline">{t('testResults.viewTrace')}</span>
              </button>
            )}
          </div>
        </div>
      )}
      {showModal && imageData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <button
            onClick={() => setShowModal(false)}
            className="absolute top-4 right-4 text-white text-2xl"
          >
            <FaTimes />
          </button>
          <div className="relative">
            <img
              src={imageData}
              alt="Screenshot"
              className="max-w-full max-h-full"
              onError={(e) => console.error('Error loading image:', e)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default TestResultCard
