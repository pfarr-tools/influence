import { describe, expect, it } from "vitest"

import {
  buildPostDetailResponse,
  buildWeekOverviewResponse
} from "../src/services/review/server/view-models/review-view-models.js"

describe("review view models", () => {
  it("maps week overview data and keeps the configured action order", () => {
    const response = buildWeekOverviewResponse({
      selectedWeek: {
        endDate: "2026-08-16",
        focus: "Sommerreihe",
        id: "week-01",
        postCount: 1,
        posts: [
          {
            contentExists: false,
            date: "2026-08-10",
            hasAssets: false,
            hasRenderedPreviews: false,
            isApproved: false,
            postId: "post-0001",
            qaReadyForApproval: false,
            rubric: "Impuls",
            status: "in Arbeit",
            theme: "Ankommen",
            weekday: "Montag",
            workflow: {
              contentGenerated: false,
              exportGenerated: false,
              imagesGenerated: false,
              qaReadyForApproval: false,
              qaRun: false,
              reelImagesGenerated: false,
              reelRendered: false,
              rendered: false,
              scaffolded: true
            }
          }
        ],
        startDate: "2026-08-10"
      },
      weekOptions: [
        {
          endDate: "2026-08-16",
          focus: "Sommerreihe",
          id: "week-01",
          postCount: 1,
          posts: [],
          startDate: "2026-08-10"
        }
      ]
    })

    expect(response.weekActions.map((action) => action.action)).toEqual([
      "scaffold",
      "generate",
      "qa",
      "images",
      "images-reel",
      "render",
      "render-reel"
    ])
    expect(
      response.weekActions.find((action) => action.action === "generate")
    ).toMatchObject({
      completed: false,
      supportsForce: true
    })
    expect(response.selectedWeek.posts[0]?.badges).toContain("QA offen")
    expect(response.weekOptions[0]?.label).toBe("2026-08-10 bis 2026-08-16")
  })

  it("adds voiceover recording guidance to the post detail response", () => {
    const response = buildPostDetailResponse(
      {
        assetPaths: [],
        content: {
          editorial_core: {
            audience: "Familien",
            main_message: "Kernbotschaft",
            title: "Titel"
          },
          metadata: { assets: [] },
          platforms: {
            facebook: { headline: "Headline", text: "Facebook-Text" },
            instagram: {
              caption: "Instagram-Caption",
              carousel: [{ type: "content", text: "Karussellkarte" }]
            },
            mastodon: { text: "Mastodon-Text" },
            reel: {
              duration_seconds: 0,
              hook: "Hook",
              script: "Erster Satz. Zweiter Satz. Dritter Satz.",
              shots: ["Einstellung 1", "Einstellung 2", "Einstellung 3"]
            },
            story: {
              slides: [{ text: "Slide 1" }]
            }
          },
          qa: { approved: false, warnings: [] },
          status: "in Arbeit",
          visual: {
            alt_text: "Alt",
            concept: "Konzept",
            flux_prompt: "Prompt"
          }
        },
        contentPath: "/tmp/content.json",
        exportPath: "/tmp/export.json",
        imagePreviewPaths: [],
        post: {
          datum: "2026-08-10",
          id: "post-0001",
          rubrik: "Impuls",
          thema: "Ankommen",
          wochentag: "Montag"
        },
        qaSummary: undefined,
        reelAudioPath: "",
        reelSubtitleFontName: "",
        reelSubtitleFontsDir: "",
        renderPreviewPaths: [],
        workflow: {
          contentGenerated: true,
          exportGenerated: false,
          imagesGenerated: false,
          qaReadyForApproval: false,
          qaRun: false,
          reelImagesGenerated: false,
          reelRendered: false,
          rendered: false,
          scaffolded: true
        }
      } as any,
      "2026-08-10"
    )

    expect(response.reel.durationSeconds).toBeGreaterThan(0)
    expect(response.reel.voiceoverSegments).toHaveLength(3)
    expect(response.reel.voiceoverSegments[0]).toMatchObject({
      index: 0,
      startSeconds: 0
    })
    expect(response.content.instagramCarousel).toEqual([
      { type: "content", text: "Karussellkarte" }
    ])
    expect(response.facebookImageHref).toBeNull()
    expect(response.facebookShareUrl).toBeNull()
  })
})
