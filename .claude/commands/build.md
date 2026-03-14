Build the Electron application for the current platform.

Steps:
1. Run typecheck first:
```bash
npm run typecheck
```

2. If typecheck passes, build for the current platform (macOS):
```bash
npm run build:mac
```

3. Report: typecheck results, build success/failure, output location in `dist/`.
