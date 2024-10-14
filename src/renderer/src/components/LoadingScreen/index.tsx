import React from 'react'

interface LoadingModalProps {
  isOpen: boolean
  message?: string
}

const LoadingScreen: React.FC<LoadingModalProps> = ({ isOpen, message = 'Loading...' }): JSX.Element | null => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div className="flex flex-col items-center justify-center bg-white rounded-lg p-8 shadow-lg space-y-4">
        {/* Spinner using Tailwind CSS classes */}
        <div className="h-16 w-16 border-8 border-t-8 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-lg font-semibold">{message}</p>
      </div>
    </div>
  )
}

export default LoadingScreen
