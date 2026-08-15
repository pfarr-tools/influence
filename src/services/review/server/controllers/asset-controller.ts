import { relative } from "node:path"
import { resolve } from "node:path"
import { unlink } from "node:fs/promises"

import {
  storeReviewAsset,
  storeReviewReelAudioAsset
} from "../../review-service.js"
import { getPostById } from "../../../calendar/calendar-service.js"
import {
  getContentOutputPaths,
  readContentPackage,
  writeJsonFile
} from "../../../content/content-storage.js"
import { assetKindSchemaPublic } from "../contracts/review-contracts.js"
import { parseFormBody } from "../request/parse-form-body.js"
import type { ReviewServerDependencies } from "../routes/review-routes.js"

export async function uploadPostAsset(
  postId: string,
  request: Parameters<typeof parseFormBody>[0],
  dependencies: ReviewServerDependencies
) {
  const form = await parseFormBody(request)
  const uploadedAsset = form.getFile("asset_upload")
  const assetKind = assetKindSchemaPublic.parse(form.get("asset_kind"))
  const imageCredits =
    form.get("image_credits") || process.env.IMAGE_CREDITS || ""
  const isAi = form.get("is_ai") === "true"
  const reelShotIndexRaw = form.get("reel_shot_index")
  const reelShotIndex =
    reelShotIndexRaw.length > 0
      ? Number.parseInt(reelShotIndexRaw, 10)
      : undefined

  if (!uploadedAsset) {
    throw new Error("Keine Asset-Datei empfangen.")
  }

  const storedPath = await storeReviewAsset(
    dependencies.calendar,
    postId,
    dependencies.runtimeConfig.outputDir,
    {
      assetKind,
      file: uploadedAsset,
      imageCredits,
      isAi,
      reelShotIndex
    }
  )

  return {
    notice: "Asset gespeichert.",
    storedPath: relative(dependencies.runtimeConfig.outputDir, storedPath)
  }
}

export async function uploadVoiceoverAsset(
  postId: string,
  request: Parameters<typeof parseFormBody>[0],
  dependencies: ReviewServerDependencies
) {
  const form = await parseFormBody(request)
  const recordedAudio = form.getFile("audio_upload")

  if (!recordedAudio) {
    throw new Error("Keine Audio-Aufnahme empfangen.")
  }

  const storedPath = await storeReviewReelAudioAsset(
    dependencies.calendar,
    postId,
    dependencies.runtimeConfig.outputDir,
    recordedAudio
  )

  return {
    notice: "Voiceover gespeichert.",
    storedPath: relative(dependencies.runtimeConfig.outputDir, storedPath)
  }
}

export async function deleteReviewAsset(
  postId: string,
  assetPath: string,
  dependencies: ReviewServerDependencies
) {
  const post = getPostById(dependencies.calendar, postId)
  const paths = getContentOutputPaths(
    dependencies.runtimeConfig.outputDir,
    post
  )
  const normalized = assetPath.replace(/^\/+/, "")
  if (!normalized.startsWith("assets/") || normalized.includes("..")) {
    throw new Error("Ungültiger Asset-Pfad.")
  }
  const content = await readContentPackage(paths.contentPath)
  if (!content.metadata.assets.includes(normalized)) {
    throw new Error("Asset nicht gefunden.")
  }
  await unlink(resolve(paths.baseDir, normalized))
  await writeJsonFile(paths.contentPath, {
    ...content,
    metadata: {
      ...content.metadata,
      assets: content.metadata.assets.filter((value) => value !== normalized)
    }
  })
  return { notice: "Asset gelöscht." }
}
