import React from 'react'

interface ContentAreaProps {
  children: React.ReactNode
}

const ContentArea: React.FC<ContentAreaProps> = ({ children }): JSX.Element => {
  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10">
      <div className="relative flex flex-col border border-neutral-bdr p-8 rounded-lg bg-white shadow-card hover:shadow-card-hover transition-shadow duration-200">
        {children}
      </div>
    </div>
  )
}

export default ContentArea
