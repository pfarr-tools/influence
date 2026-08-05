import { readFile } from "node:fs/promises"

import type { Calendar, CalendarPost, CalendarWeek } from "../../domain/calendar.js"
import { CalendarValidationError } from "./errors.js"
import { calendarSchema, isoMonthInputSchema } from "./calendar-schema.js"

/**
 * Reads a calendar JSON file from disk and validates it against the project schema.
 *
 * @param path Relative or absolute path to the calendar JSON file.
 * @returns The parsed and validated calendar object.
 * @throws {CalendarValidationError} If the file cannot be read, parsed, or validated.
 */
export async function loadCalendarFromFile(path: string): Promise<Calendar> {
  let rawContent: string

  try {
    rawContent = await readFile(path, "utf8")
  } catch (error) {
    throw new CalendarValidationError(
      `Could not read calendar file "${path}": ${getErrorMessage(error)}`
    )
  }

  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(rawContent)
  } catch (error) {
    throw new CalendarValidationError(
      `Calendar file "${path}" does not contain valid JSON: ${getErrorMessage(error)}`
    )
  }

  const result = calendarSchema.safeParse(parsedJson)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
      .join("\n")

    throw new CalendarValidationError(
      `Calendar validation failed for "${path}":\n${details}`
    )
  }

  return result.data
}

/**
 * Finds the calendar week that contains a given ISO date.
 *
 * @param calendar Parsed calendar data.
 * @param date ISO date in `YYYY-MM-DD` format.
 * @returns The matching calendar week.
 * @throws {CalendarValidationError} If the date format is invalid or no week matches.
 */
export function getWeekForDate(calendar: Calendar, date: string): CalendarWeek {
  assertIsoDate(date)

  const targetTime = parseIsoDateToUtc(date)
  const week = calendar.wochen.find((entry) => {
    const start = parseIsoDateToUtc(entry.zeitraum.von)
    const end = parseIsoDateToUtc(entry.zeitraum.bis)

    return targetTime >= start && targetTime <= end
  })

  if (!week) {
    throw new CalendarValidationError(`No week found for date "${date}"`)
  }

  return week
}

/**
 * Returns all posts scheduled for a given ISO month.
 *
 * @param calendar Parsed calendar data.
 * @param month ISO month in `YYYY-MM` format.
 * @returns The month posts sorted by date.
 * @throws {CalendarValidationError} If the month format is invalid or no posts exist.
 */
export function getPostsForMonth(
  calendar: Calendar,
  month: string
): CalendarPost[] {
  const monthResult = isoMonthInputSchema.safeParse(month)

  if (!monthResult.success) {
    throw new CalendarValidationError(`Invalid month "${month}". Expected YYYY-MM`)
  }

  const posts = calendar.wochen
    .flatMap((week) => week.beitraege)
    .filter((post) => post.datum.startsWith(`${month}-`))
    .sort((left, right) => left.datum.localeCompare(right.datum))

  if (posts.length === 0) {
    throw new CalendarValidationError(`No posts found for month "${month}"`)
  }

  return posts
}

/**
 * Finds a single post by its calendar post identifier.
 *
 * @param calendar Parsed calendar data.
 * @param postId Calendar post identifier such as `post-0001`.
 * @returns The matching calendar post.
 * @throws {CalendarValidationError} If the post does not exist.
 */
export function getPostById(calendar: Calendar, postId: string): CalendarPost {
  const post = calendar.wochen
    .flatMap((week) => week.beitraege)
    .find((entry) => entry.id === postId)

  if (!post) {
    throw new CalendarValidationError(`No post found for id "${postId}"`)
  }

  return post
}

/**
 * Validates a CLI date argument before calendar lookup.
 *
 * @param value Candidate ISO date string.
 * @throws {CalendarValidationError} If the value is not in `YYYY-MM-DD` format.
 */
function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CalendarValidationError(
      `Invalid date "${value}". Expected YYYY-MM-DD`
    )
  }
}

/**
 * Converts an ISO date string into a UTC timestamp for inclusive range comparisons.
 *
 * @param value ISO date string in `YYYY-MM-DD` format.
 * @returns UTC timestamp at midnight for the given date.
 */
function parseIsoDateToUtc(value: string): number {
  const [year, month, day] = value.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * Formats a Zod issue path into dot notation for readable CLI errors.
 *
 * @param path Path segments emitted by Zod.
 * @returns Dot notation path or `root` for top-level issues.
 */
function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "root"
  }

  return path.join(".")
}

/**
 * Normalizes unknown error values to a readable string.
 *
 * @param error Unknown thrown value.
 * @returns Human-readable error text.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
