import type { IncomingMessage } from "node:http"
import { rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { getPostById, getWeekForDate } from "../../../calendar/calendar-service.js"
import { scaffoldPostById, scaffoldWeekByDate } from "../../../content/content-scaffolder.js"
import { generateContentForWeek } from "../../../content/content-generator.js"
import { runQaForPost, runQaForWeek } from "../../../content/content-qa.js"
import {
  generateImagesForPost,
  generateImagesForWeek,
  generateReelImagesForPost,
  generateReelImagesForWeek
} from "../../../image/image-generator.js"
import {
  renderPostById,
  renderReelById,
  renderReelsForWeek,
  renderWeekByDate
} from "../../../render/index.js"
import {
  approveReviewPost,
  exportReviewPost,
  loadReviewPost,
  loadReviewWeek,
  rescheduleReviewPost,
  regenerateReviewPost,
  updateReviewPost
} from "../../review-service.js"
import {
  postEditRequestSchema,
  postScheduleRequestSchema,
  weekPostMoveRequestSchema
} from "../contracts/review-contracts.js"
import type { PostIdeaRequest } from "../contracts/review-contracts.js"
import { parseJsonBody } from "../request/parse-json-body.js"
import {
  buildPostDetailResponse,
  buildWeekOverviewResponse
} from "../view-models/review-view-models.js"
import type { ReviewServerDependencies } from "../routes/review-routes.js"

export async function getWeekOverview(
  weekDate: string,
  dependencies: ReviewServerDependencies,
  notices: Array<{ kind: "error" | "notice"; text: string }> = []
) {
  const overview = await loadReviewWeek(
    dependencies.calendar,
    weekDate,
    dependencies.runtimeConfig.outputDir
  )

  return buildWeekOverviewResponse(overview, notices)
}

export async function runWeekAction(
  weekDate: string,
  action: string,
  dependencies: ReviewServerDependencies,
  options: { force?: boolean } = {}
) {
  const force = options.force ?? false

  switch (action) {
    case "scaffold":
      await scaffoldWeekByDate(
        dependencies.calendar,
        weekDate,
        dependencies.runtimeConfig.outputDir
      )
      return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Wochengerüste erstellt." }])
    case "generate":
      await generateContentForWeek(
        dependencies.calendar,
        weekDate,
        {
          dryRun: false,
          force,
          language: "de",
          model: dependencies.runtimeConfig.openAiModel,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        dependencies
      )
      return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Wocheninhalte generiert." }])
    case "qa":
      await runQaForWeek(
        dependencies.calendar,
        weekDate,
        dependencies.runtimeConfig.outputDir
      )
      return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Wochen-QA ausgeführt." }])
    case "images":
      await generateImagesForWeek(
        dependencies.calendar,
        weekDate,
        {
          dryRun: false,
          force,
          model: dependencies.runtimeConfig.fluxModel,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          imageClient: dependencies.imageClient
        }
      )
      return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Wochenbilder erzeugt." }])
    case "images-reel":
      await generateReelImagesForWeek(
        dependencies.calendar,
        weekDate,
        {
          dryRun: false,
          force,
          model: dependencies.runtimeConfig.fluxModel,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          imageClient: dependencies.imageClient
        }
      )
      return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Wochen-Reelbilder erzeugt." }])
    case "render":
      await renderWeekByDate(
        dependencies.calendar,
        weekDate,
        {
          force,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          pageRenderClient: dependencies.pageRenderClient
        }
      )
      return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Wochenvorschauen gerendert." }])
    case "render-reel":
      await renderReelsForWeek(
        dependencies.calendar,
        weekDate,
        {
          force,
          outputRoot: dependencies.runtimeConfig.outputDir,
          subtitleFontName: dependencies.runtimeConfig.reelSubtitleFontName,
          subtitleFontsDir: dependencies.runtimeConfig.reelSubtitleFontsDir || undefined
        }
      )
      return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Wochen-Reels gerendert." }])
    default:
      throw new Error("Nicht unterstützte Wochenaktion.")
  }
}

export async function createReviewPostIdea(weekDate: string, input: PostIdeaRequest, dependencies: ReviewServerDependencies) {
  const week = getWeekForDate(dependencies.calendar, weekDate)
  if (input.date < week.zeitraum.von || input.date > week.zeitraum.bis) throw new Error("Das Datum liegt nicht in der ausgewählten Woche.")
  const sequence = dependencies.calendar.wochen.flatMap((entry) => entry.beitraege).length + 1
  const id = `post-${String(sequence).padStart(4, "0")}`
  const post = {
    id, datum: input.date, wochentag: new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(new Date(`${input.date}T00:00:00Z`)),
    rubrik: input.rubric, saeule: "", ziel: "", vorproduktion: "", plattformen_und_formate: { facebook: ["feed"], instagram: ["feed"], mastodon: ["post"] },
    struktur: ["Grundidee"], ki_hilfe: ["Keine"], status: "Idee", thema: input.title, konkrete_idee: "", redaktionsfelder: {
      arbeitstitel: input.title, facebook_text: "", instagram_caption: "", mastodon_text: "", story_ablauf: [""], reel_skript: "", bildidee: "", ki_bildprompt: "", alt_text: "", hashtags: [], veroeffentlichungszeit: "", asset_pfade: [], notizen: ""
    }
  }
  week.beitraege.push(post as never)
  await writeFile(dependencies.runtimeConfig.calendarPath, `${JSON.stringify(dependencies.calendar, null, 2)}\n`, "utf8")
  await scaffoldPostById(dependencies.calendar, id, dependencies.runtimeConfig.outputDir)
  return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Neue Beitragsidee angelegt." }])
}

export async function moveWeekPost(
  weekDate: string,
  postId: string,
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
  const body = weekPostMoveRequestSchema.parse(await parseJsonBody(request))
  const week = getWeekForDate(dependencies.calendar, weekDate)

  if (body.date < week.zeitraum.von || body.date > week.zeitraum.bis) {
    throw new Error("Beiträge können in der Wochenansicht nur innerhalb der ausgewählten Woche verschoben werden.")
  }

  await rescheduleReviewPost(
    dependencies.calendar,
    postId,
    dependencies.runtimeConfig.outputDir,
    dependencies.runtimeConfig.calendarPath,
    body
  )

  return getWeekOverview(weekDate, dependencies, [{ kind: "notice", text: "Beitrag innerhalb der Woche verschoben." }])
}

export async function getPostDetail(
  postId: string,
  dependencies: ReviewServerDependencies,
  notices: Array<{ kind: "error" | "notice"; text: string }> = []
) {
  const detail = await loadReviewPost(
    dependencies.calendar,
    postId,
    dependencies.runtimeConfig.outputDir
  )
  const week = getWeekForDate(dependencies.calendar, detail.post.datum)

  const postIndex = week.beitraege.findIndex((entry) => entry.id === postId)
  return buildPostDetailResponse(detail, week.zeitraum.von, notices, {
    nextPostId: week.beitraege[postIndex + 1]?.id,
    previousPostId: week.beitraege[postIndex - 1]?.id
  })
}

export async function runPostAction(
  postId: string,
  action: string,
  request: IncomingMessage,
  dependencies: ReviewServerDependencies,
  options: { force?: boolean } = {}
) {
  const force = options.force ?? false

  switch (action) {
    case "scaffold":
      await scaffoldPostById(
        dependencies.calendar,
        postId,
        dependencies.runtimeConfig.outputDir
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Beitragsgerüst erstellt." }])
    case "generate":
      await regenerateReviewPost(
        dependencies.calendar,
        postId,
        {
          dryRun: false,
          force,
          language: "de",
          model: dependencies.runtimeConfig.openAiModel,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        dependencies
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Inhalt generiert." }])
    case "edit": {
      const body = postEditRequestSchema.parse(await parseJsonBody(request))
      await updateReviewPost(
        dependencies.calendar,
        postId,
        dependencies.runtimeConfig.outputDir,
        body
      )
      return getPostDetail(postId, dependencies, [{
        kind: "notice",
        text: "Inhalt gespeichert. Die QA-Freigabe wurde zurückgesetzt."
      }])
    }
    case "qa":
      await runQaForPost(
        dependencies.calendar,
        postId,
        dependencies.runtimeConfig.outputDir
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "QA ausgeführt." }])
    case "images":
      await generateImagesForPost(
        dependencies.calendar,
        postId,
        {
          dryRun: false,
          force,
          model: dependencies.runtimeConfig.fluxModel,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          imageClient: dependencies.imageClient
        }
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Bilder erzeugt." }])
    case "images-reel":
      await generateReelImagesForPost(
        dependencies.calendar,
        postId,
        {
          dryRun: false,
          force,
          model: dependencies.runtimeConfig.fluxModel,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          imageClient: dependencies.imageClient
        }
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Reelbilder erzeugt." }])
    case "render":
      await renderPostById(
        dependencies.calendar,
        postId,
        {
          force,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          pageRenderClient: dependencies.pageRenderClient
        }
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Social-Bilder gerendert." }])
    case "render-reel":
      await renderReelById(
        dependencies.calendar,
        postId,
        {
          ffmpegBinary: dependencies.runtimeConfig.ffmpegBinary,
          force,
          outputRoot: dependencies.runtimeConfig.outputDir,
          subtitleFontName: dependencies.runtimeConfig.reelSubtitleFontName,
          subtitleFontsDir: dependencies.runtimeConfig.reelSubtitleFontsDir || undefined
        }
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Reel gerendert." }])
    case "approve":
      await approveReviewPost(
        dependencies.calendar,
        postId,
        dependencies.runtimeConfig.outputDir
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Beitrag freigegeben." }])
    default:
      throw new Error("Nicht unterstützte Beitragsaktion.")
  }
}

export async function reschedulePost(
  postId: string,
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
  const body = postScheduleRequestSchema.parse(await parseJsonBody(request))

  await rescheduleReviewPost(
    dependencies.calendar,
    postId,
    dependencies.runtimeConfig.outputDir,
    dependencies.runtimeConfig.calendarPath,
    body
  )

  return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Termin aktualisiert." }])
}

export async function downloadPostExport(
  postId: string,
  dependencies: ReviewServerDependencies
) {
  return exportReviewPost(
    dependencies.calendar,
    postId,
    dependencies.runtimeConfig.outputDir
  )
}

export async function deleteReviewPost(postId: string, dependencies: ReviewServerDependencies) {
  const post = getPostById(dependencies.calendar, postId)
  const week = getWeekForDate(dependencies.calendar, post.datum)
  if (week.beitraege.length <= 1) throw new Error("Der letzte Beitrag einer Woche kann nicht gelöscht werden.")
  week.beitraege = week.beitraege.filter((entry) => entry.id !== postId)
  await writeFile(dependencies.runtimeConfig.calendarPath, `${JSON.stringify(dependencies.calendar, null, 2)}\n`, "utf8")
  await rm(join(dependencies.runtimeConfig.outputDir, post.datum, post.id), { force: true, recursive: true })
  return { notice: "Beitrag gelöscht." }
}
