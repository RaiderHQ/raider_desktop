/**
 * The session the recorder's webview runs in. Recorded websites stay apart from the
 * app's own session, where raider-media:// is registered, so they can't reach it.
 * Persistent, like the default session it replaces, so logins survive a restart.
 */
export const RECORDER_PARTITION = 'persist:recorder'
