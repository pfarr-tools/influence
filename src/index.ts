import { Command, InvalidArgumentError } from "commander"

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
import {
  runQaForPost,
  runQaForWeek
} from "./services/content/content-qa.js"
import {
  generateImagesForPost,
  generateImagesForWeek
} from "./services/image/image-generator.js"
import { createFluxImageClient } from "./services/image/flux-client.js"
import { createLiturgicalSourceClient } from "./services/liturgy/liturgical-source.js"
import { createOpenAIContentClient } from "./services/openai/openai-client.js"
import {
  createPlaywrightHtmlRenderClient,
  renderPostById,
  renderWeekByDate
} from "./services/render/index.js"
import { createReviewServer } from "./services/review/index.js"

const program = new Command()
const runtimeConfig = loadRuntimeConfig()
const defaultCalendarPath = runtimeConfig.calendarPath
const defaultOutputRoot = runtimeConfig.outputDir
const liturgicalSourceClient = createLiturgicalSourceClient()

program
  .name("director")
  .description("CLI for calendar validation and lookup")
  .showHelpAfterError()

const calendarCommand = program.command("calendar").description("Calendar commands")
const contentCommand = program.command("content").description("Content commands")
const imageCommand = program.command("image").description("Image commands")
const qaCommand = program.command("qa").description("Quality assurance checks")
const renderCommand = program.command("render").description("Render commands")
const reviewCommand = program.command("review").description("Local review UI")

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
            liturgicalSourceClient,
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
            liturgicalSourceClient,
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
            liturgicalSourceClient,
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

imageCommand
  .command("generate")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .option("--dry-run", "Show Flux requests without calling the API", false)
  .option("--force", "Overwrite existing generated image outputs", false)
  .option("--model <name>", "Flux model to use", runtimeConfig.fluxModel)
  .option("--seed <seed>", "Optional deterministic seed", parseIntegerOption)
  .description("Generate text-free image assets for one post")
  .action(
    async (options: {
      dryRun: boolean
      force: boolean
      model: string
      postId: string
      seed?: number
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const result = await generateImagesForPost(
          calendar,
          options.postId,
          {
            dryRun: options.dryRun,
            force: options.force,
            model: options.model,
            outputRoot: defaultOutputRoot,
            seed: options.seed
          },
          {
            imageClient:
              options.dryRun || runtimeConfig.fluxApiBaseUrl === ""
                ? undefined
                : createFluxImageClient({
                    apiBaseUrl: runtimeConfig.fluxApiBaseUrl,
                    apiKey: runtimeConfig.fluxApiKey,
                    generatePath: runtimeConfig.fluxApiGeneratePath
                  })
          }
        )

        printImageGenerationResult(result)
      } catch (error) {
        handleCliError(error)
      }
    }
  )

imageCommand
  .command("generate-week")
  .requiredOption("--date <date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .option("--dry-run", "Show Flux requests without calling the API", false)
  .option("--force", "Overwrite existing generated image outputs", false)
  .option("--model <name>", "Flux model to use", runtimeConfig.fluxModel)
  .option("--seed <seed>", "Optional deterministic seed", parseIntegerOption)
  .description("Generate text-free image assets for every post in a week")
  .action(
    async (options: {
      date: string
      dryRun: boolean
      force: boolean
      model: string
      seed?: number
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const results = await generateImagesForWeek(
          calendar,
          options.date,
          {
            dryRun: options.dryRun,
            force: options.force,
            model: options.model,
            outputRoot: defaultOutputRoot,
            seed: options.seed
          },
          {
            imageClient:
              options.dryRun || runtimeConfig.fluxApiBaseUrl === ""
                ? undefined
                : createFluxImageClient({
                    apiBaseUrl: runtimeConfig.fluxApiBaseUrl,
                    apiKey: runtimeConfig.fluxApiKey,
                    generatePath: runtimeConfig.fluxApiGeneratePath
                  })
          }
        )

        for (const result of results) {
          printImageGenerationResult(result)
        }
      } catch (error) {
        handleCliError(error)
      }
    }
  )

qaCommand
  .command("post")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .description("Run rule-based QA checks for one content package")
  .action(async (options: { postId: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const result = await runQaForPost(
        calendar,
        options.postId,
        defaultOutputRoot
      )

      printQaResult(result)
    } catch (error) {
      handleCliError(error)
    }
  })

qaCommand
  .command("week")
  .requiredOption("--date <date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .description("Run rule-based QA checks for every content package in a week")
  .action(async (options: { date: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const results = await runQaForWeek(
        calendar,
        options.date,
        defaultOutputRoot
      )

      for (const result of results) {
        printQaResult(result)
      }
    } catch (error) {
      handleCliError(error)
    }
  })

renderCommand
  .command("post")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .option("--force", "Overwrite existing rendered outputs", false)
  .description("Render all supported graphics for one post")
  .action(async (options: { force: boolean; postId: string }) => {
    const renderer = createPlaywrightHtmlRenderClient()

    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const result = await renderPostById(
        calendar,
        options.postId,
        {
          force: options.force,
          outputRoot: defaultOutputRoot
        },
        {
          pageRenderClient: renderer
        }
      )

      printRenderResult(result)
    } catch (error) {
      handleCliError(error)
    }
  })

renderCommand
  .command("week")
  .requiredOption("--date <date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .option("--force", "Overwrite existing rendered outputs", false)
  .description("Render all supported graphics for every post in a week")
  .action(async (options: { date: string; force: boolean }) => {
    const renderer = createPlaywrightHtmlRenderClient()

    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const results = await renderWeekByDate(
        calendar,
        options.date,
        {
          force: options.force,
          outputRoot: defaultOutputRoot
        },
        {
          pageRenderClient: renderer
        }
      )

      for (const result of results) {
        printRenderResult(result)
      }
    } catch (error) {
      handleCliError(error)
    }
  })

reviewCommand
  .command("serve")
  .option("--host <host>", "Interface to bind the local review server to", "127.0.0.1")
  .option("--port <port>", "TCP port for the local review server", parseIntegerOption, 3040)
  .description("Start a local Bootstrap review interface")
  .action(async (options: { host: string; port: number }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const server = createReviewServer({
        calendar,
        imageClient:
          runtimeConfig.fluxApiBaseUrl === ""
            ? undefined
            : createFluxImageClient({
                apiBaseUrl: runtimeConfig.fluxApiBaseUrl,
                apiKey: runtimeConfig.fluxApiKey,
                generatePath: runtimeConfig.fluxApiGeneratePath
              }),
        liturgicalSourceClient,
        modelClient:
          runtimeConfig.openAiApiKey === ""
            ? undefined
            : createOpenAIContentClient(runtimeConfig.openAiApiKey),
        pageRenderClient: createPlaywrightHtmlRenderClient(),
        runtimeConfig
      })

      server.listen(options.port, options.host, () => {
        console.log(
          `Review UI available at http://${options.host}:${options.port}/`
        )
      })
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

/**
 * Prints one image generation result in a CLI-friendly way.
 *
 * @param result Image generation result to display.
 */
function printImageGenerationResult(result: {
  contentPath: string
  dryRunRequests?: Array<{
    aspectRatio: string
    height: number
    model: string
    negativePrompt: string
    outputFormat: string
    postId: string
    prompt: string
    seed?: number
    width: number
  }>
  jobs: Array<{
    assetPath: string
    aspectRatio: string
    error?: string
    rawResponsePath: string
    status: "failed" | "succeeded"
  }>
  postId: string
  summaryPath: string
}): void {
  console.log(`Image jobs for ${result.postId}`)
  console.log(`Content: ${result.contentPath}`)
  console.log(`Summary: ${result.summaryPath}`)

  if (result.dryRunRequests) {
    console.log("Dry-run requests:")

    for (const request of result.dryRunRequests) {
      console.log(JSON.stringify(request, null, 2))
    }

    return
  }

  for (const job of result.jobs) {
    if (job.status === "succeeded") {
      console.log(
        `- ${job.aspectRatio}: succeeded -> ${job.assetPath} (raw: ${job.rawResponsePath})`
      )
      continue
    }

    console.log(
      `- ${job.aspectRatio}: failed -> ${job.error ?? "unknown error"} (raw: ${job.rawResponsePath})`
    )
  }
}

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError(`Expected integer seed, received "${value}"`)
  }

  return parsed
}

/**
 * Prints one render result in a CLI-friendly way.
 *
 * @param result Render result to display.
 */
function printRenderResult(result: {
  contentPath: string
  postId: string
  renders: Array<{
    format: string
    htmlPath: string
    imagePath: string
    overflowWarnings: string[]
    pageCount: number
    pageIndex: number
    pageLabel: string
    variant: string
  }>
  summaryPath: string
  template: string
  warnings: string[]
}): void {
  console.log(`Rendered ${result.postId} with template ${result.template}`)
  console.log(`Content: ${result.contentPath}`)
  console.log(`Summary: ${result.summaryPath}`)

  for (const render of result.renders) {
    console.log(
      `- ${render.format} ${render.pageIndex}/${render.pageCount} [${render.variant}]: ${render.imagePath} (html: ${render.htmlPath})`
    )

    for (const warning of render.overflowWarnings) {
      console.log(`  warning: ${warning}`)
    }
  }

  for (const warning of result.warnings) {
    if (!result.renders.some((render) => render.overflowWarnings.includes(warning))) {
      console.log(`warning: ${warning}`)
    }
  }
}

function printQaResult(result: {
  contentPath: string
  errors: string[]
  postId: string
  readyForApproval: boolean
  statusAfterRun: string
  statusBeforeRun: string
  summaryPath: string
  warnings: string[]
}): void {
  console.log(`QA ${result.postId}: ${result.readyForApproval ? "ready" : "blocked"}`)
  console.log(`Content: ${result.contentPath}`)
  console.log(`Summary: ${result.summaryPath}`)
  console.log(`Status: ${result.statusBeforeRun} -> ${result.statusAfterRun}`)

  for (const error of result.errors) {
    console.log(`error: ${error}`)
  }

  for (const warning of result.warnings) {
    console.log(`warning: ${warning}`)
  }
}
