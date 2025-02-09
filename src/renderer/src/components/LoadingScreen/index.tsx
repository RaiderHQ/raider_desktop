import React from 'react'
import { sample } from 'lodash'
import useLoadingStore from '@foundation/Stores/loadingStore'

interface LoadingScreenProps {
  shouldPersist?: boolean
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  shouldPersist = true
}): JSX.Element | null => {
  const loading: boolean = useLoadingStore((state: { loading: boolean }) => state.loading)

  if (!loading && shouldPersist) return null

  const loadingMessages = [
    'Sharpening pickaxes... treasure awaits!',
    'Dusting off ancient maps... almost ready!',
    'Hold tight, gem-hunter! Loading precious rubies...'
  ]

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div className="flex flex-col items-center justify-center bg-white rounded-lg p-8 shadow-lg space-y-4">
        {/* Spinner using Tailwind CSS classes */}
        <div className="h-16 w-16 border-8 border-t-8 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-lg font-semibold">{sample(loadingMessages)}</p>
      </div>
    </div>
  )
}

export default LoadingScreen
