import Router from './Router'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
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
