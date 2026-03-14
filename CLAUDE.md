# Raider Desktop - Claude Code Configuration

## Project Overview

Raider Desktop is a desktop application that serves two key purposes:
1. **Primary Purpose**: A GUI companion for [Ruby Raider](https://github.com/RaiderHQ/ruby_raider) - the Ruby test automation framework
2. **Secondary Purpose**: A standalone solution that can function independently without requiring deep Ruby Raider knowledge

This dual nature means the app should:
- Integrate seamlessly with Ruby Raider projects (create, open, manage)
- Provide value even for users who want a visual test automation tool without CLI interaction
- Abstract away Ruby Raider complexity while exposing its power through an intuitive UI

## Tech Stack

### Core Technologies
- **Electron**: Cross-platform desktop app framework
- **TypeScript**: Type-safe JavaScript for both main and renderer processes
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Vitest**: Unit testing framework

### Build & Packaging
- **electron-builder**: Creates distributable packages
- **electron-vite**: Electron-specific Vite configuration

## Architecture

### Electron Process Model
- **Main Process** (`src/main/`): Node.js backend, handles file system, shell commands, Ruby Raider CLI interactions
- **Renderer Process** (`src/renderer/`): Web-based frontend, React/Vue-like UI components
- **Preload Scripts**: Secure bridge between main and renderer processes

### Key Features
1. **Project Management**: Create new Ruby Raider projects, open existing ones
2. **Test Recorder**: Record user interactions and generate test scripts
3. **Test Runner**: Execute tests and display results
4. **Dashboard**: Project statistics and recording session info
5. **Settings**: Configure browsers, mobile capabilities, selector priorities

## Dependencies

### System Requirements
- **rbenv**: Ruby version manager (required)
- **Ruby 3.0.0+**: Required for Ruby Raider gem
- **ruby_raider gem**: The underlying CLI tool this app wraps

### Platform Support
- **macOS**: Currently the only supported platform
- **Windows/Linux**: Planned for future releases

## Development Guidelines

### Code Style
- Follow TypeScript best practices with strict type checking
- Use ESLint and Prettier configurations (`.eslintrc.cjs`, `.prettierrc.yaml`)
- Maintain consistent formatting with `.editorconfig`

### Testing
- Unit tests in `test/` directory
- Run tests with `npm test` or `vitest`
- Prefer integration tests for Electron main process interactions

### Building
- Development: `npm run dev`
- Production builds: `npm run build:mac` (Windows/Linux variants exist)

## Important Patterns

### Dual Nature Considerations
When adding features, consider:
- **Ruby Raider Integration**: Does this leverage existing Ruby Raider functionality?
- **Standalone Value**: Can users benefit from this without understanding Ruby Raider internals?
- **Abstraction**: Hide Ruby Raider CLI details behind intuitive UI elements

### File Structure
- Keep Ruby Raider project files separate from app configuration
- Store user preferences in Electron's app data directory
- Handle Ruby Raider gem installation checks gracefully

### Error Handling
Common error scenarios (see README "Common Errors"):
- rbenv not installed/configured
- Ruby version too old
- Permission denied on project folders
- macOS security warnings (unverified developer)

## Security Considerations

- macOS apps require manual security exception on first run
- File system access must respect user permissions
- Shell command execution (for Ruby Raider CLI) should sanitize inputs

## Git Workflow

- Main branch: `main`
- Current status: Clean working tree
- Recent focus: README documentation improvements

## Future Considerations

### Cross-Platform Expansion
- Windows and Linux support is planned
- Consider platform-specific Ruby installation differences (RVM on Linux, etc.)

### Standalone Enhancements
- May need to reduce Ruby Raider dependency for certain features
- Consider bundling Ruby/gems with the application for simpler installation
- Explore additional recorder/playback features independent of Ruby Raider

## Notes for AI Assistants

- When suggesting Ruby Raider integrations, always consider the standalone use case
- Prioritize user experience over exposing technical details
- Remember that many users may not be Ruby developers
- Focus on visual, intuitive interfaces over CLI-style interactions
- When in doubt about Ruby Raider specifics, check the [Ruby Raider repository](https://github.com/RaiderHQ/ruby_raider)
