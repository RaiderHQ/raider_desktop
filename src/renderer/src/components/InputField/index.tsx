import React from 'react'

interface InputFieldProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  className?: string
  label?: string
  disabled?: boolean
  autoFocus?: boolean
}

const InputField: React.FC<InputFieldProps> = ({
  value,
  onChange,
  onKeyDown,
  placeholder = '',
  type = 'text',
  className = '',
  label,
  disabled = false,
  autoFocus = false
}) => {
  const baseStyles =
    'block w-full px-3 py-1 border border-neutral-bdr rounded text-sm focus:ring-ruby focus:border-ruby transition-colors'
  const disabledStyles = 'bg-neutral-lt cursor-not-allowed'

  const combinedClassName = `${baseStyles} ${disabled ? disabledStyles : ''} ${className}`.trim()

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-dk mb-1">
          {label}
        </label>
      )}
      <input
        type={type}
        className={combinedClassName}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </div>
  )
}

export default InputField
