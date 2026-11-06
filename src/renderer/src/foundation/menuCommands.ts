/** What the menu bar can ask for (mirrors MenuCommand in main). */
export const MENU_COMMANDS = [
  'new-project',
  'open-project',
  'save',
  'record',
  'run',
  'how-it-works'
] as const
export type MenuCommand = (typeof MENU_COMMANDS)[number]

export const isMenuCommand = (value: unknown): value is MenuCommand =>
  typeof value === 'string' && (MENU_COMMANDS as readonly string[]).includes(value)

type Handler = (command: MenuCommand) => void
const handlers = new Set<Handler>()

/** The page that owns the action (Save, Record, Run) listens here; returns the unsubscribe. */
export function onMenuCommand(handler: Handler): () => void {
  handlers.add(handler)
  return (): void => {
    handlers.delete(handler)
  }
}

export function dispatchMenuCommand(command: MenuCommand): void {
  for (const handler of Array.from(handlers)) handler(command)
}
