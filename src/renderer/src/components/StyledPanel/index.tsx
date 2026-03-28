import React from 'react'

const StyledPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative w-full h-full">
      <div className="relative w-full h-full flex flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

export default StyledPanel
