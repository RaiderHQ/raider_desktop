import React, { useState } from 'react'
import Tooltip from '@components/Tooltip'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  /** Plain-language help, shown on hover and focus of the field */
  tooltip?: string
  ariaLabel?: string
  /** The remove button's accessible name for a tag */
  removeLabel?: (tag: string) => string
}

const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  placeholder = 'Add option...',
  disabled = false,
  tooltip,
  ariaLabel,
  removeLabel
}) => {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      if (!tags.includes(inputValue.trim())) {
        onChange([...tags, inputValue.trim()])
      }
      setInputValue('')
    }
  }

  const removeTag = (tagToRemove: string): void => {
    onChange(tags.filter((tag) => tag !== tagToRemove))
  }

  const input = (
    <input
      type="text"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      className="w-full px-3 py-2 border border-neutral-bdr rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent disabled:opacity-50"
    />
  )

  return (
    <div className="flex flex-col gap-2">
      {tooltip ? (
        <Tooltip content={tooltip} position="bottom" className="w-full">
          {input}
        </Tooltip>
      ) : (
        input
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-lt border border-neutral-bdr rounded-md text-sm text-neutral-dk"
            >
              {tag}
              <button
                type="button"
                aria-label={removeLabel?.(tag)}
                onClick={() => removeTag(tag)}
                disabled={disabled}
                className="text-neutral-md hover:text-ruby transition-colors disabled:cursor-not-allowed"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default TagInput
