/** Resolves the CLI's special immediate scheduling value to an ISO timestamp. */
export function resolveScheduleTime(value: string, now = new Date()): string {
  return value.toLowerCase() === "now" ? now.toISOString() : value
}
