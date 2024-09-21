interface ButtonProps {
  type?: 'primary' | 'secondary'
  onClick?: () => void
  children: React.ReactNode
}

const Button: React.FC<ButtonProps> = ({ type, children, onClick }): JSX.Element => {
  if (type === 'primary') {
    return (
      <button
        onClick={onClick}
        className="min-w-[150px] text-sm py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600"
      >
        {children}
      </button>
    )
  }

  if (type === 'secondary') {
    return (
      <button
        onClick={onClick}
        className="min-w-[150px] text-sm py-2 bg-blue-100 text-blue-600 font-semibold rounded-lg hover:bg-blue-200"
      >
        {children}
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="min-w-[150px] text-sm py-2 bg-gray-300 text-blue-600 font-semibold rounded-lg hover:bg-gray-400"
    >
      {children}
    </button>
  )
}

export default Button
