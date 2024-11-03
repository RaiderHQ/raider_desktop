import Router from './Router'
import LoadingScreen from '@components/LoadingScreen'

const App = (): JSX.Element => {
  return (
    <>
      <LoadingScreen />
      <Router />
    </>
  )
}

export default App
