import { createHashRouter, RouterProvider } from 'react-router-dom'
import Editor from './pages/Project/Editor'
import Landing from '@pages/Landing'
import MainTemplate from '@templates/Main'
import NewProject from '@pages/Project/New'
import Overview from '@pages/Project/Overview'
import Settings from '@pages/Project/Settings'

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
        { path: 'new', element: <NewProject /> },
        { path: 'editor', element: <Editor /> },
        { path: 'overview', element: <Overview /> },
        { path: 'settings', element: <Settings /> }
      ]
    }
  ])

  return <RouterProvider router={router} />
}

export default Router
