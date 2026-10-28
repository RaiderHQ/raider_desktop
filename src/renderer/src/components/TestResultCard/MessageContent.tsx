import React, { useState } from 'react'
import {
  FaChevronRight,
  FaChevronDown,
  FaExclamationTriangle,
  FaExternalLinkAlt
} from 'react-icons/fa'

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
    const headerMatch = block.match(/^(\S+):\s*(.+)\((\w+)\)\s*(https?:\/\/\S+)/)
    if (!headerMatch) continue
    const [, id, rawDesc, severity, helpUrl] = headerMatch
    const description = rawDesc.trim()
    const nodes: A11yNode[] = []
    const nodeBlocks = block.split(/Selector:\s+/).slice(1)
    for (const nb of nodeBlocks) {
      const selectorMatch = nb.match(/^(.+?)(?:[\r\n]|$)/)
      const htmlMatch = nb.match(/HTML:\s*(.+?)(?:[\r\n]|$)/)
      const fixMatch =
        nb.match(/Fix any of the following:\s*[\r\n]\s*-\s*(.+?)(?:[\r\n]|$)/) ||
        nb.match(/Fix all of the following:\s*[\r\n]\s*-\s*(.+?)(?:[\r\n]|$)/)
      const descMatch = !fixMatch ? nb.match(/(?:HTML:.*[\r\n])\s+(.+?)(?:[\r\n]|$)/) : null
      nodes.push({
        selector: selectorMatch?.[1]?.trim() || '',
        html: htmlMatch?.[1]?.trim() || '',
        fix: fixMatch?.[1]?.trim() || descMatch?.[1]?.trim() || ''
      })
    }
    const validNodes = nodes.filter((n) => n.selector || n.html || n.fix)
    violations.push({ id, description, severity, helpUrl, nodes: validNodes })
  }
  return violations.length > 0 ? violations : null
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  serious: 'bg-orange-100 text-orange-800 border-orange-300',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  minor: 'bg-blue-100 text-blue-800 border-blue-300'
}

export const MessageContent: React.FC<{ message: string }> = ({ message }) => {
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
                      {node.fix && <p className="mt-1 text-neutral-mid">{node.fix}</p>}
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
