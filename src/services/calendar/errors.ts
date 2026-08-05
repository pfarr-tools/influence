/**
 * Represents a user-facing calendar loading or validation failure.
 */
export class CalendarValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CalendarValidationError"
  }
}
