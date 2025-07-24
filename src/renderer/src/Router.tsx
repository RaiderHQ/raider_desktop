import { createHashRouter, RouterProvider } from 'react-router-dom'
import FileEditor from '@pages/FileEditor'
import MainTemplate from '@templates/Main'
import NewProject from '@pages/New'
import Overview from '@pages/Overview'
import Settings from '@pages/Settings'
import Dashboard from '@pages/Dashboard'
import Recorder from '@pages/Recorder'
import Landing from '@pages/Landing'

const Router = (): JSX.Element => {
  const router = createHashRouter([
    {
      // This is now the main layout route for your entire app.
      path: '/',
      element: <MainTemplate />,
      children: [
        // By setting 'index: true', Recorder will render at the root path '/'
        {
          index: true,
          element: <Recorder />
        },
        { path: 'new', element: <NewProject /> },
        { path: 'start-project', element: <Landing /> },
        { path: 'file-editor', element: <FileEditor /> },
        { path: 'overview', element: <Overview /> },
        { path: 'recorder', element: <Recorder /> },
        { path: 'settings', element: <Settings /> },
        { path: 'dashboard', element: <Dashboard /> }
      ]
    }
  ])

  return <RouterProvider router={router} />
}

export default Router
