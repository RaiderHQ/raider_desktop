interface AppState {
  savedTest: { name: string; steps: string[] } | null;
}

const saveRecording = async (appState: AppState, testName: string, steps: string[]): Promise<{ success: boolean }> => {
  console.log(`[MainProcess] Saving test "${testName}" with ${steps.length} steps.`);
  appState.savedTest = { name: testName, steps };
  return { success: true };
};

export default saveRecording;
