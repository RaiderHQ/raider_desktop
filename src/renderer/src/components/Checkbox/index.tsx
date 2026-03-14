import React from 'react'

interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  helpText?: string
}

const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange, disabled = false, helpText }) => {
  return (
    <label
      className={`flex items-start gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-neutral-bdr text-ruby focus:ring-ruby accent-ruby"
      />
      <div className="flex flex-col">
        <span className="text-sm text-neutral-dk">{label}</span>
        {helpText && <span className="text-xs text-neutral-mid">{helpText}</span>}
      </div>
    </label>
  )
}

export default Checkbox
