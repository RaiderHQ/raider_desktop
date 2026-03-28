import React, { useState, useRef, useEffect } from 'react'

interface DropdownOption {
  label: string
  onClick: () => void
}

interface DropdownProps {
  buttonText: string
  options: DropdownOption[]
  defaultOption?: number
  disabled?: boolean
}

const Dropdown: React.FC<DropdownProps> = ({
  buttonText,
  options,
  defaultOption = 0,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState(defaultOption)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleToggle = (): void => {
    if (!disabled) {
      setIsOpen(!isOpen)
    }
  }

  const handleOptionClick = (index: number): void => {
    setSelected(index)
    setIsOpen(false)
    options[index].onClick()
  }

  useEffect((): (() => void) => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div>
        <button
          onClick={handleToggle}
          disabled={disabled}
          className={`text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium transition-colors ${
            disabled
              ? 'text-neutral-mid cursor-not-allowed bg-white'
              : 'text-neutral-dk bg-white hover:bg-neutral-50'
          }`}
        >
          {buttonText}
        </button>
      </div>
      {isOpen && (
        <div className="origin-top-left absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div
            className="py-1"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="options-menu"
          >
            {options.map((option, index) => (
              <a
                href="#"
                key={index}
                onClick={(e: React.MouseEvent<HTMLAnchorElement, MouseEvent>): void => {
                  e.preventDefault()
                  handleOptionClick(index)
                }}
                className={`block px-4 py-2 text-sm text-neutral-dk hover:bg-neutral-lt ${
                  index === selected ? 'bg-neutral-bdr' : ''
                }`}
                role="menuitem"
              >
                {option.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dropdown
