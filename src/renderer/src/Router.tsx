import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import FileEditor from '@pages/FileEditor'
import MainTemplate from '@templates/Main'
import NewProject from '@pages/New'
import Overview from '@pages/Overview'
import Landing from '@pages/Landing'

export const routes: RouteObject[] = [
  {
    // This is now the main layout route for your entire app.
    path: '/',
    element: <MainTemplate />,
    children: [
      // By setting 'index: true', Landing will render at the root path '/'
      {
        index: true,
        element: <Landing />
      },
      { path: 'new', element: <NewProject /> },
      { path: 'start-project', element: <Landing /> },
      { path: 'file-editor', element: <FileEditor /> },
      {
        path: 'overview',
        element: <Overview />,
        // Children render nothing themselves: Overview reads the testKey param
        children: [{ path: 'tests' }, { path: 'tests/new' }, { path: 'tests/:testKey' }]
      },
      // The recorder now lives on the Tests tab
      { path: 'recorder', element: <Navigate to="/overview/tests" replace /> }
    ]
  }
]

const Router = (): JSX.Element => {
  const router = createHashRouter(routes)

  return <RouterProvider router={router} />
}

export default Router
