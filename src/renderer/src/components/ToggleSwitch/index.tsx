import React, { useId } from 'react'

interface ToggleSwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  description?: string
  testId?: string
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
  description,
  testId
}) => {
  const id = useId()
  const switchId = `${id}-switch`
  const descriptionId = `${id}-description`
  return (
    <div className="flex items-center gap-3">
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ruby focus:ring-offset-2 ${
          checked ? 'bg-ruby' : 'bg-neutral-bdr'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <div className="flex flex-col">
        <label htmlFor={switchId} className="text-sm font-medium text-neutral-dk cursor-pointer">
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="text-xs text-neutral-md">
            {description}
          </span>
        )}
      </div>
    </div>
  )
}

export default ToggleSwitch
