import { Command, InvalidArgumentError } from "commander"
import { resolve } from "node:path"

import {
  getPostsForMonth,
  getPostById,
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
  generateReelImagesForPost,
  generateReelImagesForWeek,
  generateImagesForWeek
} from "./services/image/image-generator.js"
import { createFluxImageClient } from "./services/image/flux-client.js"
import { createLiturgicalSourceClient } from "./services/liturgy/liturgical-source.js"
import { createOpenAIJsonChatClient } from "./services/openai/json-chat-client.js"
import { createOpenAIContentClient } from "./services/openai/openai-client.js"
import {
  createPlaywrightHtmlRenderClient,
  renderReelById,
  renderReelsForWeek,
  renderPostById,
  renderWeekByDate
} from "./services/render/index.js"
import {
  appendDiscussionMessage,
  applyContentChatRevision,
  approveReviewPostForPublication,
  createReviewServer,
  loadContentChatSession,
  requestContentChatRevision,
  startContentChatSession,
  type ContentChatSessionInput
} from "./services/review/index.js"
import {
  assertContentApproved,
  getContentOutputPaths,
  isPublicationApproved,
  readContentPackage
} from "./services/content/content-storage.js"
import { markContentAsGenerated } from "./services/content/content-manual.js"
import {
  createConfiguredAdapters,
  DryRunPublicationAdapter,
  buildFacebookAssistant,
  PublicationJobStore,
  PublishingService,
  notifyPublicationWebhook,
  resolveScheduleTime,
  type PublicationPlatform
} from "./services/publishing/index.js"
import { createMastodonOAuthService } from "./services/publishing/mastodon-adapter.js"
import { createThreadsOAuthService } from "./services/publishing/threads-adapter.js"
import { createFacebookOAuthService } from "./services/publishing/facebook-adapter.js"
import { syncContentRepository } from "./services/content/content-repository.js"
import { scheduleTageslosungen } from "./services/losungen/tageslosungen-service.js"
import { generatePrayer, type PrayerKind } from "./services/prayers/prayer-generator.js"

const program = new Command()
const runtimeConfig = loadRuntimeConfig()
const defaultCalendarPath = runtimeConfig.calendarPath
const defaultOutputRoot = runtimeConfig.outputDir
const liturgicalSourceClient = createLiturgicalSourceClient()

program
  .name("influence")
  .description("CLI for calendar validation and lookup")
  .showHelpAfterError()

const calendarCommand = program.command("calendar").description("Calendar commands")
const planCommand = program.command("plan").description("Content plan commands")
const contentCommand = program.command("content").description("Content commands")
const imageCommand = program.command("image").description("Image commands")
const qaCommand = program.command("qa").description("Quality assurance checks")
const renderCommand = program.command("render").description("Render commands")
const chatCommand = program.command("chat").description("Discuss and revise JSON content")
const reviewCommand = program.command("review").description("Local review UI")
const publishCommand = program.command("publish").description("Publication and scheduling commands")
const losungenCommand = program.command("losungen").description("Tageslosungen commands")
const prayerCommand = program.command("prayer").description("Morning and evening prayer commands")

prayerCommand
  .command("generate")
  .requiredOption("--kind <kind>", "Prayer kind: morning or evening")
  .option("--date <date>", "Target publication date (defaults to tomorrow morning or today evening)")
  .option("--dry-run", "Show the OpenAI request without changing the calendar or calling the API", false)
  .option("--force", "Overwrite an existing generated content package", false)
  .option("--model <name>", "OpenAI model to use", runtimeConfig.openAiModel)
  .option("--language <language>", "Content language", "de")
  .description("Generate a dated prayer post from the universal prayer scaffold")
  .action(async (options: {
    date?: string
    dryRun: boolean
    force: boolean
    kind: string
    language: string
    model: string
  }) => {
    try {
      if (options.kind !== "morning" && options.kind !== "evening") {
        throw new InvalidArgumentError('Kind must be "morning" or "evening".')
      }
      assertOutputRoot(defaultOutputRoot)
      const result = await generatePrayer({
        calendarPath: defaultCalendarPath,
        date: options.date,
        dryRun: options.dryRun,
        force: options.force,
        kind: options.kind as PrayerKind,
        language: options.language,
        model: options.model,
        outputRoot: defaultOutputRoot,
        publicationTimezone: runtimeConfig.publicationTimezone
      }, {
        modelClient:
          options.dryRun || runtimeConfig.openAiApiKey === ""
            ? undefined
            : createOpenAIContentClient(runtimeConfig.openAiApiKey)
      })
      console.log(`${result.kind} prayer for ${result.date}: ${result.postId}`)
      printGenerationResult(result.result)
    } catch (error) {
      handleCliError(error)
    }
  })

losungenCommand
  .command("schedule")
  .option("--year <year>", "Jahr der Losungen", String(new Date().getFullYear()))
  .option("--force", "Vorhandene Tageslosungen neu erstellen", false)
  .action(async (options: { year: string; force?: boolean }) => {
    try {
      const year = Number(options.year)
      if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new InvalidArgumentError("Jahr muss zwischen 1900 und 2200 liegen.")
      const result = await scheduleTageslosungen({
        assetsRoot: resolve("assets/losungen"),
        force: options.force ?? false,
        outputRoot: defaultOutputRoot,
        platforms: runtimeConfig.publicationPlatforms,
        publicationTimezone: runtimeConfig.publicationTimezone,
        sourceRoot: resolve("assets/losungen"),
        year
      }, {
        pageRenderClient: createPlaywrightHtmlRenderClient(),
        onProgress: (event) => {
          if (event.type === "source-loaded") {
            console.log(`[Tageslosungen] Quelle geladen: ${event.total} aktuelle Einträge für ${event.year}; ${event.ignoredPast} vergangene Einträge ignoriert.`)
          } else if (event.type === "entry-start") {
            console.log(`[${event.index}/${event.total}] ${event.entry.date} ${event.entry.weekday}: ${event.entry.verse}`)
          } else if (event.type === "skipped") {
            console.log(`  übersprungen: bereits vorhanden`)
          } else if (event.type === "content-created") {
            console.log(`  ✓ Content erstellt, freigegeben und Publikation bestätigt`)
          } else if (event.type === "background-created") {
            console.log(`  ✓ ${event.format}-Hintergrund ausgewählt und kopiert`)
          } else if (event.type === "rendered") {
            console.log(`  ✓ Social-Bilder gerendert: ${event.formats.join(", ")}`)
          } else if (event.type === "platform-scheduled") {
            console.log(`  ✓ ${event.platform} geplant für ${event.scheduledAt}`)
          } else if (event.type === "entry-complete") {
            console.log(`  ✓ Tageslosung abgeschlossen (${event.index}/${event.total})`)
          }
        }
      })
      console.log(`${result.created} Tageslosungen erstellt und geplant; ${result.skipped} übersprungen.`)
    } catch (error) { handleCliError(error) }
  })

program.hook("postAction", async (_thisCommand, actionCommand) => {
  await syncContentRepository(
    `Update content: ${actionCommand.name()}`,
    runtimeConfig
  )
})

publishCommand.command("preview")
  .requiredOption("--post-id <postId>", "Approved calendar post identifier")
  .option("--platform <platform>", "Platform to preview", "instagram")
  .option("--format <format>", "Publication format", "default")
  .description("Show a publication payload without an external API call")
  .action(async (options: { postId: string; platform: string; format: string }) => {
    try {
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const platform = options.platform as PublicationPlatform
      const service = new PublishingService(defaultOutputRoot, new Map([[platform, new DryRunPublicationAdapter(platform)]]))
      const job = await service.schedulePost(calendar, options.postId, platform, null, options.format)
      console.log(JSON.stringify({ dryRun: true, target: platform, job }, null, 2))
    } catch (error) { handleCliError(error) }
  })

publishCommand.command("approve")
  .requiredOption("--post-id <postId>", "Calendar post identifier")
  .option("--force", "Approve publication even if the content is not marked as approved")
  .description("Approve a post for publication and schedule its configured platforms")
  .action(async (options: { postId: string; force?: boolean }) => {
    try {
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      await approveReviewPostForPublication(
        calendar,
        options.postId,
        defaultOutputRoot,
        runtimeConfig,
        { force: options.force }
      )
      console.log(
        `${options.postId}: publication approved${options.force ? " (forced)" : ""} and scheduled.`
      )
    } catch (error) { handleCliError(error) }
  })

publishCommand.command("schedule")
  .requiredOption("--post-id <postId>", "Approved calendar post identifier")
  .requiredOption("--platform <platform>", "Target platform")
  .requiredOption("--at <dateTime>", "ISO date/time with timezone, or now")
  .option("--format <format>", "Publication format", "default")
  .description("Schedule an approved post")
  .action(async (options: { postId: string; platform: string; at: string; format: string }) => {
    try {
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const job = await new PublishingService(defaultOutputRoot, createConfiguredAdapters()).schedulePost(calendar, options.postId, options.platform as PublicationPlatform, resolveScheduleTime(options.at), options.format, runtimeConfig.publicationTimezone)
      console.log(`Scheduled ${job.id} for ${job.platform} at ${job.scheduledAt}`)
    } catch (error) { handleCliError(error) }
  })

publishCommand.command("run").description("Run due publication jobs").action(async () => {
  try {
    console.log("Checking publication queue …")
    const jobs = await new PublishingService(defaultOutputRoot, createConfiguredAdapters()).runDue(
      new Date(),
      (progress) => {
        if (progress.type === "scan-complete") {
          console.log(`${progress.due} of ${progress.total} jobs are due.`)
        } else if (progress.type === "started") {
          console.log(`${progress.job.id}: publishing ${progress.job.platform} for ${progress.job.postId} …`)
        } else {
          console.log(`${progress.job.id}: ${progress.job.status}`)
        }
      }
    )
    const publishedJobs = jobs.filter((job) => job.status === "published")
    if (runtimeConfig.webhookUrl && publishedJobs.length > 0) {
      await notifyPublicationWebhook(runtimeConfig.webhookUrl, runtimeConfig.webhookSecret ?? "", publishedJobs)
    }
    if (jobs.length === 0) console.log("No publication jobs due.")
  } catch (error) { handleCliError(error) }
})

publishCommand.command("retry")
  .requiredOption("--job-id <jobId>", "Publication job identifier")
  .description("Retry a failed job")
  .action(async (options: { jobId: string }) => {
    try { console.log((await new PublishingService(defaultOutputRoot, createConfiguredAdapters()).retry(options.jobId)).status) } catch (error) { handleCliError(error) }
  })

publishCommand.command("facebook")
  .requiredOption("--post-id <postId>", "Calendar post identifier")
  .description("Prepare the manual Facebook hand-off")
  .action(async (options: { postId: string }) => {
    try {
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const post = getPostById(calendar, options.postId)
      const path = getContentOutputPaths(defaultOutputRoot, post).contentPath
      const content = await readContentPackage(path)
      assertContentApproved(content, path)
      if (!(await isPublicationApproved(getContentOutputPaths(defaultOutputRoot, post).publicationApprovalPath))) {
        throw new Error("Die Veröffentlichung ist für diesen Beitrag noch nicht ausdrücklich freigegeben.")
      }
      console.log(JSON.stringify(buildFacebookAssistant(post, content, defaultOutputRoot, runtimeConfig.publicBaseUrl ?? ""), null, 2))
    } catch (error) { handleCliError(error) }
  })

publishCommand.command("mark-published")
  .requiredOption("--post-id <postId>", "Calendar post identifier")
  .requiredOption("--platform <platform>", "Platform")
  .description("Mark a manual publication as complete")
  .action(async (options: { postId: string; platform: PublicationPlatform }) => {
    try {
      const store = new PublicationJobStore(defaultOutputRoot)
      const job = (await store.list()).find((item) => item.postId === options.postId && item.platform === options.platform)
      if (!job) throw new Error("Kein passender Publication Job gefunden.")
      await store.save({ ...job, status: "published", lastError: null, updatedAt: new Date().toISOString() })
      console.log(`${job.id}: published`)
    } catch (error) { handleCliError(error) }
  })

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

planCommand
  .command("validate")
  .argument("[path]", "Path to the content plan JSON file", defaultCalendarPath)
  .description("Validate the configured content plan and display all errors")
  .action(async (path: string) => {
    try {
      const calendar = await loadCalendarFromFile(path)
      console.log(
        `Content plan is valid: ${calendar.meta.titel} (${calendar.wochen.length} weeks, ${calendar.meta.umfang.beitraege} posts declared)`
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
  .command("mark-generated")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .description("Mark manually authored content as generated")
  .action(async (options: { postId: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const content = await markContentAsGenerated(
        calendar,
        options.postId,
        defaultOutputRoot
      )
      console.log(`${options.postId}: content marked as generated (${content.metadata.generated_at})`)
    } catch (error) {
      handleCliError(error)
    }
  })

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

imageCommand
  .command("generate-reel")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .option("--dry-run", "Show Flux requests without calling the API", false)
  .option("--force", "Overwrite existing generated reel image outputs", false)
  .option("--model <name>", "Flux model to use", runtimeConfig.fluxModel)
  .option("--seed <seed>", "Optional deterministic seed", parseIntegerOption)
  .description("Generate 9:16 Flux stills for reel shots of one post")
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
        const result = await generateReelImagesForPost(
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
  .command("generate-reel-week")
  .requiredOption("--date <date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .option("--dry-run", "Show Flux requests without calling the API", false)
  .option("--force", "Overwrite existing generated reel image outputs", false)
  .option("--model <name>", "Flux model to use", runtimeConfig.fluxModel)
  .option("--seed <seed>", "Optional deterministic seed", parseIntegerOption)
  .description("Generate 9:16 Flux stills for reel shots of every post in a week")
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
        const results = await generateReelImagesForWeek(
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

renderCommand
  .command("reel")
  .requiredOption("--post-id <postId>", "Calendar post identifier, e.g. post-0001")
  .option("--audio <path>", "Optional audio track to mux into the reel")
  .option("--ffmpeg-bin <path>", "FFmpeg binary path", runtimeConfig.ffmpegBinary)
  .option(
    "--subtitle-font-name <name>",
    "Subtitle font family for burned-in reel captions",
    runtimeConfig.reelSubtitleFontName
  )
  .option(
    "--subtitle-fonts-dir <path>",
    "Optional font directory for FFmpeg subtitle rendering",
    runtimeConfig.reelSubtitleFontsDir
  )
  .option("--force", "Overwrite existing rendered reel outputs", false)
  .option(
    "--rerun",
    "Rerun only the final FFmpeg reel assembly using existing images and subtitles",
    false
  )
  .description("Render a 1080x1920 reel video for one post")
  .action(
    async (options: {
      audio?: string
      ffmpegBin: string
      force: boolean
      postId: string
      rerun: boolean
      subtitleFontName: string
      subtitleFontsDir: string
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const result = await renderReelById(
          calendar,
          options.postId,
          {
            audioPath: options.audio,
            ffmpegBinary: options.ffmpegBin,
            force: options.force || options.rerun,
            outputRoot: defaultOutputRoot,
            subtitleFontName: options.subtitleFontName,
            subtitleFontsDir: options.subtitleFontsDir || undefined
          }
        )

        printReelRenderResult(result)
      } catch (error) {
        handleCliError(error)
      }
    }
  )

renderCommand
  .command("reel-week")
  .requiredOption("--date <date>", "ISO date inside the desired week, e.g. 2026-08-10")
  .option("--audio <path>", "Optional audio track to mux into each reel")
  .option("--ffmpeg-bin <path>", "FFmpeg binary path", runtimeConfig.ffmpegBinary)
  .option(
    "--subtitle-font-name <name>",
    "Subtitle font family for burned-in reel captions",
    runtimeConfig.reelSubtitleFontName
  )
  .option(
    "--subtitle-fonts-dir <path>",
    "Optional font directory for FFmpeg subtitle rendering",
    runtimeConfig.reelSubtitleFontsDir
  )
  .option("--force", "Overwrite existing rendered reel outputs", false)
  .option(
    "--rerun",
    "Rerun only the final FFmpeg reel assembly for each post using existing images",
    false
  )
  .description("Render 1080x1920 reel videos for every post in a week")
  .action(
    async (options: {
      audio?: string
      date: string
      ffmpegBin: string
      force: boolean
      rerun: boolean
      subtitleFontName: string
      subtitleFontsDir: string
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const results = await renderReelsForWeek(
          calendar,
          options.date,
          {
            audioPath: options.audio,
            ffmpegBinary: options.ffmpegBin,
            force: options.force || options.rerun,
            outputRoot: defaultOutputRoot,
            subtitleFontName: options.subtitleFontName,
            subtitleFontsDir: options.subtitleFontsDir || undefined
          }
        )

        for (const result of results) {
          printReelRenderResult(result)
        }
      } catch (error) {
        handleCliError(error)
      }
    }
  )

chatCommand
  .command("start")
  .option("--post-id <postId>", "Open a chat session for one generated content.json")
  .option("--date <date>", "Open a chat session for one calendar week")
  .option("--plan <path>", "Open a chat session for the full editorial plan JSON")
  .option("--prompt <prompt>", "Optional initial prompt to send immediately")
  .option("--model <name>", "OpenAI model to use", runtimeConfig.openAiModel)
  .description("Create a persistent JSON discussion session")
  .action(
    async (options: {
      date?: string
      model: string
      plan?: string
      postId?: string
      prompt?: string
    }) => {
      try {
        assertOutputRoot(defaultOutputRoot)
        const calendar = await loadCalendarFromFile(defaultCalendarPath)
        const sessionInput = resolveChatSessionInput(options)
        const result = await startContentChatSession(
          sessionInput,
          {
            initialPrompt: options.prompt,
            model: options.model
          },
          {
            calendar,
            modelClient:
              options.prompt && runtimeConfig.openAiApiKey !== ""
                ? createOpenAIJsonChatClient(runtimeConfig.openAiApiKey)
                : undefined,
            runtimeConfig
          }
        )

        printChatSessionSummary(result.session)

        if (options.prompt) {
          printLatestAssistantMessage(result.session)
        }
      } catch (error) {
        handleCliError(error)
      }
    }
  )

chatCommand
  .command("message")
  .requiredOption("--session-id <sessionId>", "Persistent chat session identifier")
  .requiredOption("--text <text>", "Message to send to ChatGPT")
  .option("--model <name>", "OpenAI model to use", runtimeConfig.openAiModel)
  .description("Continue a JSON discussion session")
  .action(async (options: { model: string; sessionId: string; text: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const result = await appendDiscussionMessage(
        options.sessionId,
        options.text,
        { model: options.model },
        {
          calendar,
          modelClient: createRequiredJsonChatClient(),
          runtimeConfig
        }
      )

      printChatSessionSummary(result.session)
      printLatestAssistantMessage(result.session)
    } catch (error) {
      handleCliError(error)
    }
  })

chatCommand
  .command("revise")
  .requiredOption("--session-id <sessionId>", "Persistent chat session identifier")
  .option("--model <name>", "OpenAI model to use", runtimeConfig.openAiModel)
  .description("Request a schema-valid JSON revision for the current session")
  .action(async (options: { model: string; sessionId: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const result = await requestContentChatRevision(
        options.sessionId,
        { model: options.model },
        {
          calendar,
          modelClient: createRequiredJsonChatClient(),
          runtimeConfig
        }
      )

      printLatestRevision(result.session)
    } catch (error) {
      handleCliError(error)
    }
  })

chatCommand
  .command("apply")
  .requiredOption("--session-id <sessionId>", "Persistent chat session identifier")
  .description("Apply the latest valid revision back to the source JSON")
  .action(async (options: { sessionId: string }) => {
    try {
      assertOutputRoot(defaultOutputRoot)
      const calendar = await loadCalendarFromFile(defaultCalendarPath)
      const session = await applyContentChatRevision(options.sessionId, {
        calendar,
        runtimeConfig
      })

      printChatSessionSummary(session)
      console.log("Latest valid revision was applied to the source JSON.")
    } catch (error) {
      handleCliError(error)
    }
  })

chatCommand
  .command("show")
  .requiredOption("--session-id <sessionId>", "Persistent chat session identifier")
  .description("Show the current state of a chat session")
  .action(async (options: { sessionId: string }) => {
    try {
      const session = await loadContentChatSession(
        options.sessionId,
        defaultOutputRoot
      )

      printChatSessionSummary(session)
      printLatestAssistantMessage(session)
      printLatestRevision(session)
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
        chatModelClient:
          runtimeConfig.openAiApiKey === ""
            ? undefined
            : createOpenAIJsonChatClient(runtimeConfig.openAiApiKey),
        modelClient:
          runtimeConfig.openAiApiKey === ""
            ? undefined
            : createOpenAIContentClient(runtimeConfig.openAiApiKey),
        pageRenderClient: createPlaywrightHtmlRenderClient(),
        mastodonOAuth: createMastodonOAuthService(),
        threadsOAuth: createThreadsOAuthService(),
        facebookOAuth: createFacebookOAuthService(),
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

function resolveChatSessionInput(options: {
  date?: string
  plan?: string
  postId?: string
}): ContentChatSessionInput {
  const providedTargets = [options.postId, options.date, options.plan].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  )

  if (providedTargets.length !== 1) {
    throw new CalendarValidationError(
      "Provide exactly one of --post-id, --date, or --plan."
    )
  }

  if (options.postId) {
    return { contextType: "post", postId: options.postId }
  }

  if (options.date) {
    return { contextType: "week", weekDate: options.date }
  }

  return { contextType: "plan", planPath: options.plan }
}

function createRequiredJsonChatClient() {
  if (runtimeConfig.openAiApiKey === "") {
    throw new CalendarValidationError(
      "OPENAI_API_KEY is required for chat discussion and revision commands."
    )
  }

  return createOpenAIJsonChatClient(runtimeConfig.openAiApiKey)
}

function printChatSessionSummary(session: {
  contextRef: string
  contextType: string
  createdAt: string
  id: string
  messages: Array<unknown>
  revisions: Array<unknown>
  schemaName: string
  sourceJsonPath: string | null
}): void {
  console.log(`session: ${session.id}`)
  console.log(`context: ${session.contextType} (${session.contextRef})`)
  console.log(`schema: ${session.schemaName}`)
  console.log(`source: ${session.sourceJsonPath ?? "in-memory only"}`)
  console.log(`created: ${session.createdAt}`)
  console.log(`messages: ${session.messages.length}`)
  console.log(`revisions: ${session.revisions.length}`)
}

function printLatestAssistantMessage(session: {
  messages: Array<{ content: string; role: string }>
}): void {
  const latestAssistant = [...session.messages]
    .reverse()
    .find((message) => message.role === "assistant")

  if (!latestAssistant) {
    return
  }

  console.log("")
  console.log(latestAssistant.content)
}

function printLatestRevision(session: {
  revisions: Array<{
    appliedAt: string | null
    diff: string[]
    id: string
    model: string
    validationErrors: string[]
    validationStatus: "invalid" | "valid"
  }>
}): void {
  const latestRevision = session.revisions.at(-1)

  if (!latestRevision) {
    console.log("No revision has been requested yet.")
    return
  }

  console.log(`revision: ${latestRevision.id}`)
  console.log(`model: ${latestRevision.model}`)
  console.log(`status: ${latestRevision.validationStatus}`)
  console.log(`applied: ${latestRevision.appliedAt ?? "not yet"}`)

  if (latestRevision.validationErrors.length > 0) {
    console.log("validation errors:")

    for (const error of latestRevision.validationErrors) {
      console.log(`- ${error}`)
    }
  }

  console.log("diff:")

  for (const line of latestRevision.diff) {
    console.log(`- ${line}`)
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

function printReelRenderResult(result: {
  audioPath?: string
  contentPath: string
  durationSeconds: number
  postId: string
  segments: Array<{
    durationSeconds: number
    imagePath: string
    segmentIndex: number
    subtitleText: string
  }>
  subtitlePath: string
  summaryPath: string
  videoPath: string
}): void {
  console.log(`Reel rendered for ${result.postId}`)
  console.log(`Content: ${result.contentPath}`)
  console.log(`Video: ${result.videoPath}`)
  console.log(`Subtitles: ${result.subtitlePath}`)
  console.log(`Summary: ${result.summaryPath}`)
  console.log(`Duration: ${result.durationSeconds}s`)

  if (result.audioPath) {
    console.log(`Audio: ${result.audioPath}`)
  }

  for (const segment of result.segments) {
    console.log(
      `- segment ${segment.segmentIndex}: ${segment.imagePath} (${segment.durationSeconds}s)`
    )
  }
}
