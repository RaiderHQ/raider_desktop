// electron-builder afterPack hook: flips Electron fuses in the packaged app, before
// it is signed. Fuses only exist in the packaged binary, so `npm run dev` and the
// e2e runs (plain electron from node_modules) are not affected.
const path = require('path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context
  const binary = {
    darwin: `${packager.appInfo.productFilename}.app`,
    win32: `${packager.appInfo.productFilename}.exe`,
    linux: packager.executableName
  }[electronPlatformName]
  if (!binary) throw new Error(`Unknown platform for Electron fuses: ${electronPlatformName}`)

  await flipFuses(path.join(appOutDir, binary), {
    version: FuseVersion.V1,
    // Signing comes after this hook; on Apple silicon the ad-hoc signature must be redone
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    // ELECTRON_RUN_AS_NODE would turn the app into a plain Node.js runtime
    [FuseV1Options.RunAsNode]: false,
    // --inspect and friends would let anyone attach a debugger to the main process
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Only the signed app.asar may be loaded, not a loose app folder next to it
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  })
}
