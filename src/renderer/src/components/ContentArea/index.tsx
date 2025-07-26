import React from 'react'

interface ContentAreaProps {
  children: React.ReactNode
}

const ContentArea: React.FC<ContentAreaProps> = ({ children }): JSX.Element => {
  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10">
      <div className="relative flex flex-col">
        <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
        <div className="relative flex flex-col border border-black p-8 rounded-lg bg-white z-10">
          {children}
        </div>
      </div>
    </div>
  )
}

export default ContentArea
