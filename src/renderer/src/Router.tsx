import { createHashRouter, RouterProvider } from 'react-router-dom'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Editor from '@pages/Project/Editor'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import InstallGuide from '@pages/Info/InstallGuide'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Landing from '@pages/Landing'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import MainTemplate from '@templates/Main'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import NewProject from '@pages/Project/New'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Overview from '@pages/Project/Overview'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Settings from '@pages/Project/Settings'

const Router = (): JSX.Element => {
  const router = createHashRouter([
    {
      path: '/',
      element: <Landing />
    },
    {
      path: '/info',
      children: [{ path: 'install-guide', element: <InstallGuide /> }]
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
