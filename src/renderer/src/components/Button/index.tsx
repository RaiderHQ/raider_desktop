import React from 'react'

interface ButtonProps {
  type?: 'primary' | 'secondary' | 'disabled' | 'success' | 'outline' | 'danger'
  onClick?: () => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}

const Button = ({
  type = 'primary',
  children,
  onClick,
  disabled = false,
  className = ''
}: ButtonProps): JSX.Element => {
  const styles: Record<string, string> = {
    primary: 'bg-ruby text-white hover:shadow-card-hover',
    secondary: 'bg-ruby-sub text-neutral-dk border border-neutral-bdr hover:bg-ruby-glow',
    disabled: 'bg-neutral-bdr text-neutral-mid cursor-not-allowed',
    success: 'bg-status-ok text-white hover:shadow-card-hover',
    outline: 'bg-transparent text-ruby border border-ruby hover:bg-ruby-sub',
    danger: 'bg-status-err text-white hover:shadow-card-hover'
  }

  const baseClassName = `inline-flex items-center justify-center gap-2 min-w-[150px] px-5 py-2.5 text-sm font-semibold rounded-md tracking-wide transition-all duration-200 ${
    !disabled ? 'hover:-translate-y-px' : ''
  } ${styles[disabled ? 'disabled' : type]}`

  return (
    <button onClick={onClick} className={`${baseClassName} ${className}`} disabled={disabled}>
      {children}
    </button>
  )
}

export default Button
