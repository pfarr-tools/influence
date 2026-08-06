import { relative } from "node:path"

import {
  storeReviewAsset,
  storeReviewReelAudioAsset
} from "../../review-service.js"
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
  const reelShotIndexRaw = form.get("reel_shot_index")
  const reelShotIndex =
    reelShotIndexRaw.length > 0 ? Number.parseInt(reelShotIndexRaw, 10) : undefined

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
