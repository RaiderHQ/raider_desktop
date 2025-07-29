# Raider Desktop

Raider Desktop is the official desktop application for [Ruby Raider](https://github.com/RaiderHQ/ruby_raider), designed to simplify and accelerate your automation workflow. It provides powerful recording, editing, and the ability to manage your ruby raider projects, in order to make test automation easier and more efficient.

## Getting Started

Follow these instructions to get the project up and running on your local machine for development and testing purposes.

### Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (which includes npm)
- [Ruby](https://www.ruby-lang.org/en/documentation/installation/)

Additionally, for the application to function correctly, you must have the `ruby_raider` gem installed:
```bash
gem install ruby_raider
```

### Installation

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/your-username/raider_desktop.git
   ```
   cd RaiderUI
   ```

2. Install the project dependencies using npm:
   ```bash
   npm install
   ```

### Running the Application

To start the application in development mode, run the following command. This will launch the Electron app.

```bash
npm run dev
```

## Core Features

### Creating a New Ruby Raider Project
1.  From the landing page, click on **"Create New Project"**.
2.  On the "New Project" screen, provide a **Project Name**.
3.  Select your desired **Automation Framework** (e.g., Selenium, Appium) and **Test Framework** (e.g., Rspec, Cucumber).
4.  If you select **Appium**, you will also need to specify the **Mobile Platform** (Android or iOS).
5.  Click **"Create Project"** and select a directory where the project will be saved.
6.  The application will generate a complete Ruby Raider project structure for you.

#### Opening an Existing Project
1.  From the landing page, click on **"Open Existing Project"**.
2.  Use the file dialog to navigate to and select the root folder of your existing Ruby Raider project.
3.  The project will be loaded into the application, and you can view its file structure on the **Overview** page.

### The Recorder Page

The Recorder is the heart of RaiderUI, allowing you to record user interactions and automatically generate test scripts.

-   **Test Suites Panel**: On the left, you can create, delete, and manage your test suites. Each suite can contain multiple tests.
-   **Recording Controls**: At the top of the screen, you can set the initial URL for your test, start/stop the recording, and run tests.
-   **Recorded Steps**: The central panel displays the steps of your test as they are recorded. You can toggle between a human-readable "Friendly View" and the actual "Code View".
-   **Running Tests**: You can run a single test or an entire suite. The output of the test run will be displayed in the "Test Output" panel.
-   **Import/Export**: You can import and export individual tests, entire suites, or the whole project for easy sharing and backup.

### The Dashboard Page

The Dashboard provides a high-level overview of your project.

-   **Project Dashboard**: This tab displays key statistics about your project, such as the number of test suites and tests.
-   **Recording Dashboard**: This tab shows information related to your recording sessions and test runs.

### The Settings Page

The Settings page allows you to configure various aspects of the application and your projects.

-   **General Settings**: Configure application-wide settings, such as the display language.
-   **Project Settings**:
    -   For **web projects**, you can set the default browser and the base URL for your tests.
    -   For **mobile projects** (Appium), you can configure mobile capabilities such as platform version, device name, and app path.
-   **Recording Settings**:
    -   **Waits**: Adjust implicit and explicit wait times to control how the recorder waits for elements to appear on the page.
    -   **Selector Priorities**: Define the order of attributes the recorder should prioritize when generating selectors for elements (e.g., `id`, `name`, `data-testid`, `css`). You can add, remove, and reorder the priorities.

## Building the Application

To build the application for your specific operating system, use one of the following commands:

```bash
# For Windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```
