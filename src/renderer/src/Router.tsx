import { createHashRouter, RouterProvider } from 'react-router-dom'
import Landing from './pages/Landing'
import NewProject from './pages/Project/New'

const Router = (): JSX.Element => {
  const router = createHashRouter([
    {
      path: '/',
      element: <Landing />
    },
    {
      path: '/project/new',
      element: <NewProject />
    }
  ])

  return <RouterProvider router={router} />
}

export default Router
