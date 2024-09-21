import ArrowDown from '@assets/icons/arrow-down.svg'

interface SelectInputProps {
  label: string
  options: string[]
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  selected: string
}

const SelectInput: React.FC<SelectInputProps> = ({
  options,
  onChange,
  selected,
  label
}): JSX.Element => {
  return (
    <div>
      <label className="block mb-1 font-medium text-[14px]">{label}</label>
      <div className="relative">
        <select
          className="block w-full p-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 appearance-none focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-300"
          value={selected}
          onChange={onChange}
        >
          {options.map((option: string) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <img src={ArrowDown} className="w-4 h-auto" />
        </div>
      </div>
    </div>
  )
}

export default SelectInput
