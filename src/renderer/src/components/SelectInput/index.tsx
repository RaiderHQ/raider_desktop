import React from 'react'
import { map } from 'lodash'

interface SelectInputProps {
  label: string
  options: string[]
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  selected: string
}

const SelectInput: React.FC<SelectInputProps> = ({ options, onChange, selected, label }) => {
  return (
    <div>
      <label className="block mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-dk">
        {label}
      </label>
      <div className="relative">
        <select
          className="block w-full p-3 border border-neutral-bdr rounded-md bg-white text-neutral-dk appearance-none focus:outline-none focus:ring-2 focus:ring-ruby focus:border-ruby transition-colors"
          value={selected}
          onChange={onChange}
        >
          {map(options, (option: string) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-mid"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default SelectInput
