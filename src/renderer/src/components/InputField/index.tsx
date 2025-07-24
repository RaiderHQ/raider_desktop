import React from 'react'

interface InputFieldProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  className?: string
  label?: string // Added an optional label for better accessibility
  disabled?: boolean
}

const InputField: React.FC<InputFieldProps> = ({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  className = '',
  label,
  disabled = false
}) => {
  // Combine base styles with any custom classes passed in as props
  const baseStyles =
    'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm md:text-base lg:text-lg focus:ring-blue-500 focus:border-blue-500'
  const disabledStyles = 'bg-gray-100 cursor-not-allowed'

  const combinedClassName = `${baseStyles} ${disabled ? disabledStyles : ''} ${className}`.trim()

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        type={type}
        className={combinedClassName}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

export default InputField
