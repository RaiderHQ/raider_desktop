/**
 * A test id or step id names a file and a folder under userData/traces. Ids come from the
 * renderer and from sidecars in the project (which a cloned repository controls), so only
 * letters, digits, _ and - are accepted: nothing that can point outside the traces folder.
 */
export const SAFE_TRACE_ID = /^[A-Za-z0-9_-]+$/

export const isSafeTraceId = (id: unknown): id is string =>
  typeof id === 'string' && SAFE_TRACE_ID.test(id)
