import React from 'react'
import Tooltip from '@components/Tooltip'

interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  helpText?: string
  /** Plain-language help, shown on hover and focus of the checkbox */
  tooltip?: string
}

const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
  helpText,
  tooltip
}) => {
  const input = (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="mt-0.5 h-4 w-4 rounded border-neutral-bdr text-ruby focus:ring-ruby accent-ruby"
    />
  )

  return (
    <label
      className={`flex items-start gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {tooltip ? (
        <Tooltip content={tooltip} position="bottom">
          {input}
        </Tooltip>
      ) : (
        input
      )}
      <div className="flex flex-col">
        <span className="text-sm text-neutral-dk">{label}</span>
        {helpText && <span className="text-xs text-neutral-md">{helpText}</span>}
      </div>
    </label>
  )
}

export default Checkbox
