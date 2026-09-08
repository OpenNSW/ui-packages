// Shared enabled/readonly gate, used by any control that needs to tell
// whether the user can currently interact with it — enabled and readonly
// are independent props in @jsonforms/core, not one derived from the other.
export function isEditable(enabled?: boolean, readonly?: boolean): boolean {
  return enabled !== false && readonly !== true
}
