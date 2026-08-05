import type { z } from "zod"

import type {
  calendarPostSchema,
  calendarSchema,
  calendarWeekSchema
} from "../services/calendar/calendar-schema.js"

/** Parsed root calendar document. */
export type Calendar = z.infer<typeof calendarSchema>
/** Parsed calendar week entry. */
export type CalendarWeek = z.infer<typeof calendarWeekSchema>
/** Parsed calendar post entry. */
export type CalendarPost = z.infer<typeof calendarPostSchema>
