import React, { useId } from 'react'
import { map } from 'lodash'
import Tooltip from '@components/Tooltip'

interface SelectInputProps {
  label: string
  options: string[]
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  selected: string
  /** Plain-language help, shown on hover and focus of the field */
  tooltip?: string
}

const SelectInput: React.FC<SelectInputProps> = ({
  options,
  onChange,
  selected,
  label,
  tooltip
}) => {
  const selectId = useId()
  const select = (
    <select
      id={selectId}
      className="block w-full pl-3 pr-8 py-1 border border-neutral-bdr rounded bg-white text-sm text-neutral-dk appearance-none focus:ring-ruby focus:border-ruby transition-colors"
      value={selected}
      onChange={onChange}
    >
      {map(options, (option: string) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )

  return (
    <div>
      <label
        htmlFor={selectId}
        className="block mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-dk"
      >
        {label}
      </label>
      <div className="relative">
        {tooltip ? (
          <Tooltip content={tooltip} position="bottom" className="w-full">
            {select}
          </Tooltip>
        ) : (
          select
        )}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-md"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default SelectInput
