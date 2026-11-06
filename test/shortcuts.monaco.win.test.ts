import { checkAcceleratorsAgainstMonaco } from './helpers/monacoDefaults'

// Windows and Linux share Monaco's keybindings (Ctrl for the command key)
checkAcceleratorsAgainstMonaco('win')
