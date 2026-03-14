import React from 'react'
import { Link } from 'react-router-dom'

interface NavBtnProps {
  to: string
  label: string
  active: boolean
}

const NavBtn: React.FC<NavBtnProps> = ({ to, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
      active
        ? 'bg-ruby-sub text-ruby font-semibold'
        : 'text-neutral-mid hover:bg-neutral-lt'
    }`}
  >
    {label}
  </Link>
)

export default NavBtn
