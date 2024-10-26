import { createHashRouter, RouterProvider } from 'react-router-dom'
import Landing from '@pages/Landing'
import MainTemplate from '@templates/Main'
import NewProject from '@pages/Project/New'
import Overview from '@pages/Project/Overview'

const Router = (): JSX.Element => {
  const router = createHashRouter([
    {
      path: '/',
      element: <Landing />
    },
    {
      path: '/project',
      element: <MainTemplate />,
      children: [
        { path: '/project/new', element: <NewProject /> },
        { path: '/project/overview', element: <Overview /> }
      ]
    }
  ])

  return <RouterProvider router={router} />
}

export default Router
