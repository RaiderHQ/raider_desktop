import React from 'react'

const StyledPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative w-full h-full">
      <div className="relative w-full h-full flex flex-col border border-black rounded-lg bg-white z-10 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  )
}

export default StyledPanel
