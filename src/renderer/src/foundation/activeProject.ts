import useProjectStore from '@foundation/Stores/projectStore'

/**
 * The project the renderer is working on, sent along with a save so main can refuse one that
 * was in flight while the project changed. '' without a project (main refuses that too).
 */
export const activeProjectPath = (): string => useProjectStore.getState().projectPath ?? ''
