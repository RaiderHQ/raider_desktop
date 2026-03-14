import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import type { ScaffoldParams, ScaffoldComponentType } from '@foundation/Types/scaffoldTypes'

const COMPONENT_TYPES: { value: ScaffoldComponentType; label: string }[] = [
  { value: 'page', label: 'Page Object' },
  { value: 'spec', label: 'Spec' },
  { value: 'feature', label: 'Feature' },
  { value: 'steps', label: 'Steps' },
  { value: 'helper', label: 'Helper' },
  { value: 'component', label: 'Component' }
]

interface ScaffoldResult {
  success: boolean
  output: string
  error?: string
}

const ScaffoldPanel: React.FC = () => {
  const projectPath = useProjectStore((state) => state.projectPath)
  const { rubyCommand } = useRubyStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<ScaffoldResult | null>(null)

  const [name, setName] = useState('')
  const [type, setType] = useState<ScaffoldComponentType>('page')
  const handleGenerate = async (): Promise<void> => {
    if (!name.trim()) {
      toast.error('Please enter a name.')
      return
    }
    if (!projectPath || !rubyCommand) {
      toast.error('No project is open. Please open a project first.')
      return
    }

    const params: ScaffoldParams = {
      operation: 'generate',
      type,
      name: name.trim()
    }

    setIsGenerating(true)
    setResult(null)
    try {
      const res = await window.api.scaffoldGenerate(
        params as unknown as Record<string, unknown>,
        projectPath,
        rubyCommand
      )
      setResult(res)
      if (res.success) {
        toast.success(`Generated successfully!\n${res.output}`)
        useProjectStore.getState().loadFiles(projectPath)
      } else {
        toast.error(`Generation failed: ${res.error || res.output}`)
      }
    } catch (error) {
      const errorResult = { success: false, output: '', error: String(error) }
      setResult(errorResult)
      toast.error(`Error: ${error}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-neutral-bdr rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-neutral-dk mb-1'
  const btnPrimary =
    'px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-sm text-neutral-mid">
          Generate page objects, specs, features, steps, helpers, or components for your project.
        </p>
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ScaffoldComponentType)}
            className={inputClass}
          >
            {COMPONENT_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. login"
            className={inputClass}
          />
        </div>
        <div className="pt-1">
          <button onClick={handleGenerate} disabled={isGenerating} className={btnPrimary}>
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {result && (
          <div
            className={`mt-3 p-3 rounded-md text-sm ${
              result.success
                ? 'bg-status-ok-bg border border-status-ok text-status-ok'
                : 'bg-status-err-bg border border-status-err text-status-err'
            }`}
          >
            <pre className="whitespace-pre-wrap font-mono text-xs">
              {result.success ? result.output : result.error || result.output}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default ScaffoldPanel
