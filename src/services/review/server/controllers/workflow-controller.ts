import type { IncomingMessage } from "node:http"

import { getWeekForDate } from "../../../calendar/calendar-service.js"
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
  regenerateReviewPost,
  updateReviewPost
} from "../../review-service.js"
import { postEditRequestSchema } from "../contracts/review-contracts.js"
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
  dependencies: ReviewServerDependencies
) {
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
          force: true,
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
          force: true,
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
          force: true,
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
          force: true,
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
          force: true,
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

  return buildPostDetailResponse(detail, week.zeitraum.von, notices)
}

export async function runPostAction(
  postId: string,
  action: string,
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
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
          force: true,
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
          force: true,
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
          force: true,
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
          force: true,
          outputRoot: dependencies.runtimeConfig.outputDir
        },
        {
          pageRenderClient: dependencies.pageRenderClient
        }
      )
      return getPostDetail(postId, dependencies, [{ kind: "notice", text: "Vorschauen gerendert." }])
    case "render-reel":
      await renderReelById(
        dependencies.calendar,
        postId,
        {
          ffmpegBinary: dependencies.runtimeConfig.ffmpegBinary,
          force: true,
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
