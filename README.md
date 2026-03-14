# Raider Desktop

<!-- PROJECT LOGO -->
<br />
<div align="center">
   <a href="https://github.com/RubyRaider/ruby_raider">
   <img src="https://www.ruby-raider.com/assets/icon-DYY74ofR.png" alt="Logo" style="width:200px;">
   </a>
   <p align="center">
      <a href="https://ruby-raider.com/">Website</a>
      ·
      <a href="https://github.com/RaiderHQ/raider_desktop/issues">Report Bug</a>
      ·
      <a href="https://github.com/RaiderHQ/raider_desktop/issues">Request Feature</a>
   </p>
   <p align="center"> For more information and updates on releases, see <a href="https://ruby-raider.com">https://ruby-raider.com</a></p>
</div>

You can download the latest release of the app [here](https://github.com/RaiderHQ/raider_desktop/releases).

> [!WARNING]
> Raider Desktop is currently available for **macOS only**. Windows and Linux builds are generated via CI but are not yet fully tested.

Raider Desktop is the UI desktop companion for [Ruby Raider](https://github.com/RaiderHQ/ruby_raider), designed to simplify and accelerate your automation workflow. It provides recording, editing, and the ability to manage your Ruby Raider projects, making test automation easier and more efficient.

## Table of Contents

- [For Users](#for-users)
  - [Prerequisites](#prerequisites)
  - [Core Features](#core-features)
    - [Creating a New Ruby Raider Project](#creating-a-new-ruby-raider-project)
    - [The Test Screen](#the-test-screen)
    - [The Recorder Page](#the-recorder-page)
    - [Common Errors](#common-errors)
- [For Developers](#for-developers)
  - [Getting Started](#getting-started)
  - [Installation (for Development)](#installation-for-development)
  - [Running the Application](#running-the-application)
  - [Testing](#testing)
  - [CI/CD](#cicd)
- [Building the Application](#building-the-application)

## For Users

This section provides information for users of the Raider Desktop application.

### Prerequisites

For the application to work correctly, you must have [**rbenv**](https://github.com/rbenv/rbenv) installed with a **Ruby version higher than 3.0.0**. If you do not meet these requirements, you will see a modal on the app, and not all functionality will be available.

## Core Features

### Creating a New Ruby Raider Project
1.  From the landing page, click on **"Create New Project"**.
2.  On the "New Project" screen, provide a **Project Name**.
3.  Select your desired **Automation Framework** (e.g., Selenium, Watir) and **Test Framework** (e.g., Rspec, Cucumber).
4.  Click **"Create Project"** and select a directory where the project will be saved.
5.  The application will generate a complete Ruby Raider project structure for you.

#### Opening an Existing Project
1.  From the landing page, click on **"Open Existing Project"**.
2.  Use the file dialog to navigate to and select the root folder of your existing Ruby Raider project.
3.  The project will be loaded into the application, and you can view its file structure on the **Overview** page.

### The Test Screen

The Test Screen is the main hub for managing and running your tests. It includes several tabs:

-   **Files**: Browse and edit your project files with the built-in Monaco editor. The toolbar at the top lets you configure:
    -   **URL**: The base URL for your tests
    -   **Browser**: Choose between Chrome, Safari, Firefox, or Edge
    -   **Headless**: Toggle headless mode on/off
    -   **Viewport**: Quick presets for Desktop (1920x1080), Tablet (768x1024), or Mobile (375x812)
    -   **Run Mode**: Run all tests, smoke tests, regression tests, or custom tagged tests
-   **Scaffolding**: Generate new specs, page objects, and helpers using Ruby Raider's scaffolding commands.
-   **Dashboard**: View test results with pass/fail statistics, pie charts, and accessibility violation reports.
-   **Settings**: Configure project settings including browser options, timeouts, viewport dimensions, mobile capabilities, and file paths.
-   **Terminal**: An integrated terminal for running commands directly within the app.

### The Recorder Page

The Recorder allows you to record user interactions and automatically generate test scripts.

-   **Test Suites Panel**: On the left, you can create, delete, and manage your test suites. Each suite can contain multiple tests.
-   **Recording Controls**: At the top of the screen, you can set the initial URL for your test, start/stop the recording, and run tests.
-   **Recorded Steps**: The central panel displays the steps of your test as they are recorded. You can toggle between a human-readable "Friendly View" and the actual "Code View".
-   **Trace Timeline**: After recording, view a visual timeline of each step with screenshot thumbnails.
-   **Running Tests**: You can run a single test or an entire suite. The output of the test run will be displayed in the "Test Output" panel.
-   **Import/Export**: You can import and export individual tests, entire suites, or the whole project for easy sharing and backup.

### Common Errors

#### "rbenv not found"

This error indicates that `rbenv` is not installed or not properly configured in your shell.

**Installation:**

*   **macOS (using Homebrew):**
    ```bash
    brew install rbenv
    ```

*   **Other platforms:**
    Please refer to the official [rbenv installation guide](https://github.com/rbenv/rbenv#installation).

After installation, make sure to initialize `rbenv` in your shell:
```bash
rbenv init
```
Follow the instructions provided to set up `rbenv` in your shell configuration file (e.g., `.zshrc`, `.bash_profile`).

#### Permission Denied

If you encounter a "Permission Denied" error, grant the required permissions:

```bash
sudo chown -R $(whoami) /path/to/your/project/folder
```

#### macOS: "App cannot be opened because the developer cannot be verified."

1.  Open **System Settings** > **Privacy & Security**.
2.  Scroll down to the "Security" section.
3.  Click **"Open Anyway"** next to the message about "Ruby Raider" being blocked.
4.  Click **"Open"** in the confirmation dialog.

You will only need to do this once.

## For Developers

This section is for developers who want to contribute to the Raider Desktop project.

### Getting Started

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) v20+
- [Ruby](https://www.ruby-lang.org/en/documentation/installation/) 3.0.0+ via rbenv

Additionally, install the `ruby_raider` gem:
```bash
gem install ruby_raider
```

### Installation (for Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/RaiderHQ/raider_desktop.git
   ```
2. Navigate into the project directory:
    ```bash
   cd raider_desktop
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

To start the application in development mode with hot reload:

```bash
npm run dev
```

### Testing

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright)
npm run test:e2e
```

### CI/CD

The project uses GitHub Actions for continuous integration:

- **On push/PR to main**: Runs unit tests, then builds for macOS, Windows, and Linux
- **On tag push (`v*`)**: Creates a GitHub Release with build artifacts for all platforms

See `.github/workflows/build.yml` for the full pipeline configuration.

## Building the Application

To build the application for your specific operating system:

```bash
# For macOS
npm run build:mac

# For Windows
npm run build:win

# For Linux
npm run build:linux
```
