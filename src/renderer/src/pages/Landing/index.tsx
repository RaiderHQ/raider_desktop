import ProjectSelector from '../../components/ProjectSelector'
import Logo from '../../assets/images/logo.svg'
import OpenFolder from '../../assets/icons/open-folder.svg'
import AddIcon from '../../assets/icons/add.svg'

const Landing: React.FC = (): JSX.Element => {
  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="mb-8">
          <img src={Logo} alt="Ruby Raider Logo" className="w-28 h-auto" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Ruby Raider!</h1>
        <p className="text-center text-lg text-gray-600 mb-8">
          It is a gem that provides a generator and scaffolding to simplify UI test automation.
        </p>

        <div className="flex space-x-8 mb-8">
          <ProjectSelector
            icon={OpenFolder}
            description="Create new project"
            url="/project/new"
            buttonValue="Create"
          />
          <ProjectSelector
            icon={AddIcon}
            description="Open existing project"
            url="/project/overview"
            buttonValue="Open"
          />
        </div>

        <footer className="text-gray-500">Ruby Raider Version: 1.0.8</footer>
      </div>
    </>
  )
}

export default Landing
