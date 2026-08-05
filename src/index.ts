import { Command } from "commander"

import {
  getPostsForMonth,
  getWeekForDate,
  loadCalendarFromFile
} from "./services/calendar/calendar-service.js"
import { CalendarValidationError } from "./services/calendar/errors.js"
import {
  assertOutputRoot,
  scaffoldPostById,
  scaffoldWeekByDate
} from "./services/content/content-scaffolder.js"
import { loadRuntimeConfig } from "./config/runtime-config.js"
import {
  generateContentForMonth,
  generateContentForPost,
  generateContentForWeek
} from "./services/content/content-generator.js"
import { createOpenAIContentClient } from "./services/openai/openai-client.js"

const program = new Command()
const runtimeConfig = loadRuntimeConfig()
const defaultCalendarPath = runtimeConfig.calendarPath
const defaultOutputRoot = runtimeConfig.outputDir

program
  .name("director")
  .description("CLI for calendar validation and lookup")
  .showHelpAfterError()

const calendarCommand = program.command("calendar").description("Calendar commands")
const contentCommand = program.command("content").description("Content commands")

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

contentCommand
  .command("generate")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .option("--dry-run", "Show the OpenAI request without calling the API", false)
  .option("--force", "Overwrite an existing generated content package", false)
  .option("--model <name>", "OpenAI model to use", runtimeConfig.openAiModel)
  .option("--language <language>", "Content language", "de")
  .description("Generate a structured content package for one post")
  .action(
    async (options: {
      dryRun: boolean
      force: boolean
      language: string
      model: string
      postId: string
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const result = await generateContentForPost(
          calendar,
          options.postId,
          {
            dryRun: options.dryRun,
            force: options.force,
            language: options.language,
            model: options.model,
            outputRoot: defaultOutputRoot
          },
          {
            modelClient:
              options.dryRun || runtimeConfig.openAiApiKey === ""
                ? undefined
                : createOpenAIContentClient(runtimeConfig.openAiApiKey)
          }
        )

        printGenerationResult(result)
      } catch (error) {
        handleCliError(error)
      }
    }
  )

contentCommand
  .command("generate-week")
  .requiredOption("--date <date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .option("--dry-run", "Show the OpenAI request without calling the API", false)
  .option("--force", "Overwrite an existing generated content package", false)
  .option("--model <name>", "OpenAI model to use", runtimeConfig.openAiModel)
  .option("--language <language>", "Content language", "de")
  .description("Generate structured content packages for every post in a week")
  .action(
    async (options: {
      date: string
      dryRun: boolean
      force: boolean
      language: string
      model: string
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const results = await generateContentForWeek(
          calendar,
          options.date,
          {
            dryRun: options.dryRun,
            force: options.force,
            language: options.language,
            model: options.model,
            outputRoot: defaultOutputRoot
          },
          {
            modelClient:
              options.dryRun || runtimeConfig.openAiApiKey === ""
                ? undefined
                : createOpenAIContentClient(runtimeConfig.openAiApiKey)
          }
        )

        for (const result of results) {
          printGenerationResult(result)
        }
      } catch (error) {
        handleCliError(error)
      }
    }
  )

contentCommand
  .command("generate-month")
  .requiredOption("--month <month>", "ISO month, e.g. 2026-09")
  .option("--dry-run", "Show the OpenAI request without calling the API", false)
  .option("--force", "Overwrite an existing generated content package", false)
  .option("--model <name>", "OpenAI model to use", runtimeConfig.openAiModel)
  .option("--language <language>", "Content language", "de")
  .description("Generate structured content packages for every post in a month")
  .action(
    async (options: {
      dryRun: boolean
      force: boolean
      language: string
      model: string
      month: string
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const results = await generateContentForMonth(
          calendar,
          options.month,
          {
            dryRun: options.dryRun,
            force: options.force,
            language: options.language,
            model: options.model,
            outputRoot: defaultOutputRoot
          },
          {
            modelClient:
              options.dryRun || runtimeConfig.openAiApiKey === ""
                ? undefined
                : createOpenAIContentClient(runtimeConfig.openAiApiKey)
          }
        )

        for (const result of results) {
          printGenerationResult(result)
        }
      } catch (error) {
        handleCliError(error)
      }
    }
  )

contentCommand
  .command("scaffold")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .description("Create a local content scaffold for one post")
  .action(async (options: { postId: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const result = await scaffoldPostById(
        calendar,
        options.postId,
        defaultOutputRoot
      )

      console.log(`Scaffolded ${result.content.id} -> ${result.outputPath}`)
    } catch (error) {
      handleCliError(error)
    }
  })

contentCommand
  .command("scaffold-week")
  .requiredOption("--date <date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .description("Create local content scaffolds for every post in the matching week")
  .action(async (options: { date: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const results = await scaffoldWeekByDate(
        calendar,
        options.date,
        defaultOutputRoot
      )

      console.log(`Scaffolded ${results.length} posts for week ${options.date}`)

      for (const result of results) {
        console.log(`- ${result.content.id} -> ${result.outputPath}`)
      }
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

/**
 * Prints one generation result in a CLI-friendly way.
 *
 * @param result Generation result to display.
 */
function printGenerationResult(result: {
  contentPath: string
  dryRunRequest?: { developerPrompt: string; model: string; userPrompt: string }
  postId: string
  rawResponsePath: string
  skippedReason?: string
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}): void {
  if (result.dryRunRequest) {
    console.log(`[dry-run] ${result.postId} -> ${result.contentPath}`)
    console.log(`model: ${result.dryRunRequest.model}`)
    console.log(result.dryRunRequest.developerPrompt)
    console.log(result.dryRunRequest.userPrompt)
    return
  }

  if (result.skippedReason) {
    console.log(
      `${result.postId} -> ${result.contentPath} (raw: ${result.rawResponsePath}, skipped: ${result.skippedReason})`
    )
    return
  }

  const usage = result.usage
    ? `tokens in/out/total=${result.usage.inputTokens}/${result.usage.outputTokens}/${result.usage.totalTokens}`
    : "tokens unavailable"

  console.log(
    `${result.postId} -> ${result.contentPath} (raw: ${result.rawResponsePath}, ${usage})`
  )
}
