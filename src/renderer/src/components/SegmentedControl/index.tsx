import React, { useRef } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Stays focusable and announced, but can't be chosen. */
  disabled?: boolean
  /** Id of the element that explains why the option is disabled. */
  describedBy?: string
}

interface SegmentedControlProps<T extends string> {
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  testId?: string
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  testId
}: SegmentedControlProps<T>): React.ReactElement {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, step: number): void => {
    for (let i = 1; i <= options.length; i++) {
      const index = (from + step * i + options.length * i) % options.length
      if (!options[index].disabled) {
        onChange(options[index].value)
        refs.current[index]?.focus()
        return
      }
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(index, 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(index, -1)
    }
  }

  return (
    <div>
      <span className="block mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-dk">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        data-testid={testId}
        className="inline-flex rounded-md border border-neutral-bdr bg-white p-1 gap-1"
      >
        {options.map((option, index) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={option.disabled || undefined}
              aria-describedby={option.describedBy}
              tabIndex={selected || option.disabled ? 0 : -1}
              onClick={() => !option.disabled && onChange(option.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`px-4 py-2 text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-ruby ${
                selected
                  ? 'bg-ruby text-white'
                  : 'text-neutral-dk hover:bg-neutral-bdr/40'
              } ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SegmentedControl
