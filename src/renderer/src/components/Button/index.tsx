interface ButtonProps {
  type?: 'primary' | 'secondary' | 'disabled' | 'success'
  onClick?: () => void
  children: React.ReactNode
  disabled?: boolean
}

const Button = ({
  type = 'disabled',
  children,
  onClick,
  disabled = false
}: ButtonProps): JSX.Element => {
  const styles: Record<string, string> = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600',
    secondary: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
    disabled: 'bg-gray-300 text-blue-600 hover:bg-gray-400',
    success: 'bg-green-500 text-white hover:bg-green-600'
  }

  // Fallback to 'disabled' style if the type doesn't match
  const className = `min-w-[150px] text-sm py-2 font-semibold rounded-lg ${
    styles[type] || styles.disabled
  }`

  return (
    <button onClick={onClick} className={className} disabled={disabled}>
      {children}
    </button>
  );
}

export default Button
