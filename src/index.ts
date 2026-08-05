import { Command } from "commander"

import {
  getPostsForMonth,
  getWeekForDate,
  loadCalendarFromFile
} from "./services/calendar/calendar-service.js"
import { CalendarValidationError } from "./services/calendar/errors.js"

const program = new Command()
const defaultCalendarPath = "data/redaktionskalender-2026-2027.json"

program
  .name("director")
  .description("CLI for calendar validation and lookup")
  .showHelpAfterError()

const calendarCommand = program.command("calendar").description("Calendar commands")

calendarCommand
  .command("validate")
  .argument("<path>", "Path to the calendar JSON file")
  .description("Validate the calendar file")
  .action(async (path: string) => {
    try {
      const calendar = await loadCalendarFromFile(path)
      console.log(
        `Calendar is valid: ${calendar.meta.titel} (${calendar.wochen.length} weeks, ${calendar.meta.umfang.beitraege} posts declared)`
      )
    } catch (error) {
      handleCliError(error)
    }
  })

calendarCommand
  .command("list-week")
  .argument("<date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .description("List all posts for the week containing the given date")
  .action(async (date: string) => {
    try {
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const week = getWeekForDate(calendar, date)

      console.log(`${week.id} (${week.zeitraum.von} to ${week.zeitraum.bis})`)
      console.log(`Focus: ${week.redaktioneller_fokus}`)

      for (const post of week.beitraege) {
        console.log(
          `- ${post.datum} ${post.wochentag}: ${post.id} | ${post.rubrik} | ${post.thema}`
        )
      }
    } catch (error) {
      handleCliError(error)
    }
  })

calendarCommand
  .command("list-month")
  .argument("<month>", "ISO month, e.g. 2026-09")
  .description("List all posts for the given month")
  .action(async (month: string) => {
    try {
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const posts = getPostsForMonth(calendar, month)

      console.log(`${month}: ${posts.length} posts`)

      for (const post of posts) {
        console.log(
          `- ${post.datum} ${post.wochentag}: ${post.id} | ${post.rubrik} | ${post.thema}`
        )
      }
    } catch (error) {
      handleCliError(error)
    }
  })

void program.parseAsync(process.argv)

/**
 * Converts service and runtime errors into a CLI-friendly process exit.
 *
 * @param error The unknown error thrown by a command handler.
 * @returns This function never returns because it terminates the process.
 */
function handleCliError(error: unknown): never {
  if (error instanceof CalendarValidationError) {
    console.error(error.message)
  } else if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error("Unknown error")
  }

  process.exit(1)
}
