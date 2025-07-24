import React, { useState, useRef, useEffect } from 'react'
import Button from '@components/Button'

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div>
        <Button
          onClick={handleToggle}
          disabled={disabled}
          type={disabled ? 'disabled' : 'secondary'}
        >
          {buttonText}
        </Button>
      </div>
      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
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
                onClick={(e) => {
                  e.preventDefault()
                  handleOptionClick(index)
                }}
                className={`block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${
                  index === selected ? 'bg-gray-200' : ''
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
