import React from 'react'
import { sample } from 'lodash'
import useLoadingStore from '@foundation/Stores/loadingStore'
import Logo from '@components/Logo'

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
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center bg-white rounded-xl p-8 shadow-elevated space-y-4">
        <Logo size={48} />
        <div className="h-12 w-12 border-4 border-neutral-bdr border-t-ruby rounded-full animate-spin"></div>
        <p className="text-base font-semibold text-neutral-dark">{sample(loadingMessages)}</p>
      </div>
    </div>
  )
}

export default LoadingScreen
