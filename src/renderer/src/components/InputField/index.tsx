import React, { useId } from 'react'

interface InputFieldProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  className?: string
  label?: string
  disabled?: boolean
  autoFocus?: boolean
  /** Ties the label to the input; generated when omitted */
  id?: string
  /** What the field accepts, shown under it */
  hint?: string
  /** Why the current value is wrong; replaces the hint and marks the field invalid */
  error?: string
}

const InputField: React.FC<InputFieldProps> = ({
  value,
  onChange,
  onKeyDown,
  onBlur,
  placeholder = '',
  type = 'text',
  className = '',
  label,
  disabled = false,
  autoFocus = false,
  id,
  hint,
  error
}) => {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const messageId = `${inputId}-message`
  const message = error || hint

  const baseStyles =
    'block w-full px-3 py-1 border rounded text-sm focus:ring-ruby focus:border-ruby transition-colors'
  const borderStyles = error ? 'border-status-err' : 'border-neutral-bdr'
  const disabledStyles = 'bg-neutral-lt cursor-not-allowed'

  const combinedClassName =
    `${baseStyles} ${borderStyles} ${disabled ? disabledStyles : ''} ${className}`.trim()

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wider text-neutral-dk mb-1"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        className={combinedClassName}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
      />
      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={`mt-1 text-xs ${error ? 'text-status-err' : 'text-neutral-dk'}`}
        >
          {message}
        </p>
      )}
    </div>
  )
}

export default InputField
