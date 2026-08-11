import type { IncomingMessage } from "node:http"

import { getPostById } from "../../../calendar/calendar-service.js"
import { calendarSchema } from "../../../calendar/calendar-schema.js"
import { CalendarValidationError } from "../../../calendar/errors.js"
import { contentPackageSchema } from "../../../content/content-schema.js"
import { getContentOutputPaths, readJsonFile, writeJsonFile } from "../../../content/content-storage.js"
import { parseJsonBody } from "../request/parse-json-body.js"
import { jsonDocumentSaveRequestSchema } from "../contracts/review-contracts.js"
import type { ReviewServerDependencies } from "../routes/review-routes.js"

export async function getPostJson(postId: string, dependencies: ReviewServerDependencies) {
  const post = getPostById(dependencies.calendar, postId)
  const path = getContentOutputPaths(dependencies.runtimeConfig.outputDir, post).contentPath
  return { document: await readJsonFile(path), filename: "content.json" }
}

export async function savePostJson(
  postId: string,
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
  const body = jsonDocumentSaveRequestSchema.parse(await parseJsonBody(request))
  const post = getPostById(dependencies.calendar, postId)
  const path = getContentOutputPaths(dependencies.runtimeConfig.outputDir, post).contentPath
  const document = validateDocument(contentPackageSchema, body.document, "content.json")
  await writeJsonFile(path, document)
  return { document, filename: "content.json", notice: "content.json wurde gespeichert." }
}

export async function getPlanJson(dependencies: ReviewServerDependencies) {
  return {
    document: await readJsonFile(dependencies.runtimeConfig.calendarPath),
    filename: "content-plan.json"
  }
}

export async function savePlanJson(
  request: IncomingMessage,
  dependencies: ReviewServerDependencies
) {
  const body = jsonDocumentSaveRequestSchema.parse(await parseJsonBody(request))
  const document = validateDocument(calendarSchema, body.document, "content-plan.json")
  await writeJsonFile(dependencies.runtimeConfig.calendarPath, document)
  Object.assign(dependencies.calendar, document)
  return { document, filename: "content-plan.json", notice: "content-plan.json wurde gespeichert." }
}

function validateDocument<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown, filename: string): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data

  const details = result.error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<Wurzel>"}: ${issue.message}`)
    .join("\n")
  throw new CalendarValidationError(`${filename} enthält Validierungsfehler:\n${details}`)
}
