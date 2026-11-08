/** Why a Files tab operation was refused, for messages the renderer words itself. */
export type ProjectFileErrorCode = 'exists' | 'invalidName' | 'intoItself' | 'notFound'

/**
 * The answer of every Files tab operation. `path` is the new entry, project-relative POSIX;
 * `skipped` counts links (and other special entries) left out of a copied folder.
 */
export type ProjectFileResult =
  | { success: true; path?: string; skipped?: number }
  | { success: false; error: string; code?: ProjectFileErrorCode }
