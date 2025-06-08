

interface AppState {
  savedTest: { steps: string[] } | null;
}

/**
 * Handles the 'save-test' IPC call. Temporarily stores the array
 * of recorded steps in the main process's state.
 * @param appState The shared state object from the main process.
 * @param steps An array of command strings.
 */
const saveRecording = async (appState: AppState, steps: string[]): Promise<{ success: boolean }> => {
  console.log(`[MainProcess] Saving test with ${steps.length} steps.`);
  appState.savedTest = { steps };
  return { success: true };
};

export default saveRecording
