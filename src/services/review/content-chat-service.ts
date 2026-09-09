import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { RuntimeConfig } from "../../config/runtime-config.js"
import type { Calendar } from "../../domain/calendar.js"
import { getPostById, getWeekForDate, loadCalendarFromFile } from "../calendar/calendar-service.js"
import { calendarSchema, calendarWeekSchema } from "../calendar/calendar-schema.js"
import { CalendarValidationError } from "../calendar/errors.js"
import { contentPackageSchema } from "../content/content-schema.js"
import {
  getContentOutputPaths,
  pathExists,
  readContentPackage,
  readJsonFile,
  writeJsonFile
} from "../content/content-storage.js"

const contentChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  kind: z.enum(["discussion", "revision_request", "revision_result"]),
  content: z.string(),
  createdAt: z.string().min(1)
})

const contentChatRevisionSchema = z.object({
  createdAt: z.string().min(1),
  diff: z.array(z.string()),
  id: z.string().min(1),
  model: z.string().min(1),
  patch: z.unknown().nullable().default(null),
  rawResponse: z.unknown(),
  validationErrors: z.array(z.string()),
  validationStatus: z.enum(["invalid", "valid"]),
  validatedJson: z.unknown().nullable(),
  appliedAt: z.string().nullable()
})

const contentChatSessionSchema = z.object({
  id: z.string().min(1),
  contextType: z.enum(["post", "week", "plan", "other"]),
  contextRef: z.string().min(1),
  schemaName: z.enum(["content_package", "calendar_week", "editorial_calendar"]),
  sourceJsonPath: z.string().nullable(),
  sourceJson: z.unknown(),
  messages: z.array(contentChatMessageSchema),
  revisions: z.array(contentChatRevisionSchema),
  lastRevisionJson: z.unknown().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
})

export type ContentChatMessage = z.infer<typeof contentChatMessageSchema>
export type ContentChatRevision = z.infer<typeof contentChatRevisionSchema>
export type ContentChatSession = z.infer<typeof contentChatSessionSchema>

export type ContentChatSessionInput =
  | { contextType: "post"; postId: string }
  | { contextType: "week"; weekDate: string }
  | { contextType: "plan"; planPath?: string }
  | { contextType: "other"; contextRef: string; filePath: string; schemaName: SupportedSchemaName }

type SupportedSchemaName = ContentChatSession["schemaName"]

interface ResolvedChatContext {
  contextRef: string
  contextType: ContentChatSession["contextType"]
  schemaName: SupportedSchemaName
  sourceJson: unknown
  sourceJsonPath: string | null
}

export interface JsonDiscussionRequest {
  instructions: string
  input: string
  model: string
}

export interface JsonDiscussionResponse {
  model: string
  rawResponse: unknown
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface JsonRevisionRequest {
  input: string
  instructions: string
  model: string
  schema: Record<string, unknown>
  schemaName: string
}

export interface JsonRevisionResponse {
  model: string
  parsedJson: unknown
  rawResponse: unknown
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

const jsonPatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), path: z.string().startsWith("/"), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string().startsWith("/") }),
  z.object({ op: z.literal("replace"), path: z.string().startsWith("/"), value: z.unknown() })
])

const jsonPatchSchema = z.object({
  base_hash: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(jsonPatchOperationSchema)
})

export type JsonPatch = z.infer<typeof jsonPatchSchema>

export interface JsonChatModelClient {
  discussJson(request: JsonDiscussionRequest): Promise<JsonDiscussionResponse>
  discussJsonStream?(
    request: JsonDiscussionRequest,
    onDelta: (delta: string, snapshot: string) => Promise<void> | void
  ): Promise<JsonDiscussionResponse>
  reviseJson(request: JsonRevisionRequest): Promise<JsonRevisionResponse>
  reviseJsonStream?(
    request: JsonRevisionRequest,
    onDelta: (delta: string, snapshot: string) => Promise<void> | void
  ): Promise<JsonRevisionResponse>
}

export interface PreparedDiscussionRequest {
  prompt: string
  request: JsonDiscussionRequest
  session: ContentChatSession
}

export interface ContentChatServiceDependencies {
  calendar: Calendar
  modelClient?: JsonChatModelClient
  now?: () => Date
  onRevisionDelta?: (snapshot: string) => Promise<void> | void
  runtimeConfig: RuntimeConfig
}

export interface StartContentChatOptions {
  initialPrompt?: string
  model: string
}

export interface ContentChatActionResult {
  session: ContentChatSession
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

const maxRevisionAttempts = 3

export async function startContentChatSession(
  input: ContentChatSessionInput,
  options: StartContentChatOptions,
  dependencies: ContentChatServiceDependencies
): Promise<ContentChatActionResult> {
  const resolvedContext = await resolveChatContext(input, dependencies)
  const now = dependencies.now ?? (() => new Date())
  const timestamp = now().toISOString()

  let session: ContentChatSession = {
    id: randomUUID(),
    contextRef: resolvedContext.contextRef,
    contextType: resolvedContext.contextType,
    createdAt: timestamp,
    lastRevisionJson: null,
    messages: [],
    revisions: [],
    schemaName: resolvedContext.schemaName,
    sourceJson: resolvedContext.sourceJson,
    sourceJsonPath: resolvedContext.sourceJsonPath,
    updatedAt: timestamp
  }

  await persistChatSession(session, dependencies.runtimeConfig.outputDir)

  if (!options.initialPrompt || options.initialPrompt.trim().length === 0) {
    return { session }
  }

  return appendDiscussionMessage(
    session.id,
    options.initialPrompt,
    { model: options.model },
    dependencies
  )
}

export async function loadContentChatSession(
  sessionId: string,
  outputRoot: string
): Promise<ContentChatSession> {
  const sessionPath = getChatSessionPath(outputRoot, sessionId)

  if (!(await pathExists(sessionPath))) {
    throw new CalendarValidationError(`Chat session "${sessionId}" not found.`)
  }

  return contentChatSessionSchema.parse(await readJsonFile(sessionPath))
}

export async function appendDiscussionMessage(
  sessionId: string,
  text: string,
  options: { model: string },
  dependencies: ContentChatServiceDependencies
): Promise<ContentChatActionResult> {
  const preparedRequest = await prepareDiscussionRequest(
    sessionId,
    text,
    options,
    dependencies
  )

  const client = dependencies.modelClient

  if (!client) {
    throw new CalendarValidationError(
      "OPENAI_API_KEY is required for chat discussion requests."
    )
  }

  const discussionResponse = await client.discussJson(preparedRequest.request)
  const updatedSession = await persistDiscussionReply(
    preparedRequest.session,
    preparedRequest.prompt,
    discussionResponse.text,
    dependencies
  )

  return {
    session: updatedSession,
    usage: discussionResponse.usage
  }
}

export async function prepareDiscussionRequest(
  sessionId: string,
  text: string,
  options: { model: string },
  dependencies: ContentChatServiceDependencies
): Promise<PreparedDiscussionRequest> {
  const session = await loadContentChatSession(sessionId, dependencies.runtimeConfig.outputDir)
  const prompt = text.trim()

  if (prompt.length === 0) {
    throw new CalendarValidationError("Chat-Nachrichten dürfen nicht leer sein.")
  }

  return {
    prompt,
    request: {
      input: buildDiscussionInput(session, prompt),
      instructions: buildDiscussionInstructions(session),
      model: options.model
    },
    session
  }
}

export async function persistDiscussionReply(
  session: ContentChatSession,
  prompt: string,
  assistantText: string,
  dependencies: Pick<ContentChatServiceDependencies, "now" | "runtimeConfig">
): Promise<ContentChatSession> {
  const now = dependencies.now ?? (() => new Date())
  const userMessage = createMessage("user", "discussion", prompt, now)
  const assistantMessage = createMessage("assistant", "discussion", assistantText, now)
  const updatedSession: ContentChatSession = {
    ...session,
    messages: [...session.messages, userMessage, assistantMessage],
    updatedAt: now().toISOString()
  }

  await persistChatSession(updatedSession, dependencies.runtimeConfig.outputDir)
  return updatedSession
}

export async function requestContentChatRevision(
  sessionId: string,
  options: { instruction?: string; model: string },
  dependencies: ContentChatServiceDependencies
): Promise<ContentChatActionResult> {
  const session = await loadContentChatSession(sessionId, dependencies.runtimeConfig.outputDir)
  const client = dependencies.modelClient

  if (!client) {
    throw new CalendarValidationError(
      "OPENAI_API_KEY is required for structured JSON revisions."
    )
  }

  const now = dependencies.now ?? (() => new Date())
  const schema = getJsonSchemaForSession(session)
  const requestMessage = createMessage(
    "user",
    "revision_request",
    [
      options.instruction ? `Änderungsanweisung: ${options.instruction}` : null,
      "Bitte überarbeite jetzt das JSON anhand des gesamten Chatverlaufs. Gib ausschließlich einen Patch im vorgegebenen Patch-Schema zurück. Gib keine Erklärung und keine Markdown-Codeblöcke aus."
    ].filter((value): value is string => value !== null).join("\n\n"),
    now
  )

  let revisionResponse: JsonRevisionResponse | null = null
  let appliedPatch: JsonPatch | null = null
  let validationErrors: string[] = []
  let lastRevisionError: unknown

  for (let attempt = 1; attempt <= maxRevisionAttempts; attempt += 1) {
    try {
      const revisionRequest = {
        input: buildRevisionInput(session, validationErrors, schema, options.instruction),
        instructions: buildRevisionInstructions(session, validationErrors),
        model: options.model,
        schema,
        schemaName: session.schemaName
      }
      revisionResponse = client.reviseJsonStream
        ? await client.reviseJsonStream(revisionRequest, async (_delta, snapshot) => {
            await dependencies.onRevisionDelta?.(snapshot)
          })
        : await client.reviseJson(revisionRequest)
    } catch (error) {
      lastRevisionError = error
      break
    }

    const patchValidation = jsonPatchSchema.safeParse(revisionResponse.parsedJson)
    if (!patchValidation.success) {
      validationErrors = patchValidation.error.issues.map(formatValidationIssueInGerman)
      continue
    }

    let patchedJson: unknown
    try {
      patchedJson = applyJsonPatch(session.sourceJson, patchValidation.data)
    } catch (error) {
      validationErrors = [error instanceof Error ? error.message : "Patch konnte nicht angewendet werden."]
      continue
    }

    const attemptValidation = validateRevisionJson(session.schemaName, patchedJson)
    if (attemptValidation.success) {
      validationErrors = []
      revisionResponse = { ...revisionResponse, parsedJson: patchedJson }
      appliedPatch = patchValidation.data
      break
    }

    validationErrors = attemptValidation.error.issues.map(formatValidationIssueInGerman)
  }

  if (!revisionResponse || lastRevisionError) {
    const errorMessage = lastRevisionError instanceof Error
      ? lastRevisionError.message
      : "Unbekannter Fehler bei der strukturierten Überarbeitung."
    const revision = createInvalidRevision(
      lastRevisionError instanceof Error ? { message: lastRevisionError.message } : { error: "unknown" },
      errorMessage,
      now
    )
    const updatedSession = appendRevision(session, requestMessage, revision, now)
    await persistChatSession(updatedSession, dependencies.runtimeConfig.outputDir)

    return { session: updatedSession }
  }

  const validation = validateRevisionJson(session.schemaName, revisionResponse.parsedJson)
  const revision =
    validation.success
      ? createValidRevision(
          revisionResponse.model,
          revisionResponse.rawResponse,
          validation.data,
          diffJsonValues(session.sourceJson, validation.data),
          now,
          appliedPatch!
        )
      : createInvalidRevision(
          revisionResponse.rawResponse,
          validationErrors.join("\n"),
          now,
          revisionResponse.model
        )
  const updatedSession = appendRevision(session, requestMessage, revision, now)

  await persistChatSession(updatedSession, dependencies.runtimeConfig.outputDir)

  return {
    session: updatedSession,
    usage: revisionResponse.usage
  }
}

export async function applyContentChatRevision(
  sessionId: string,
  dependencies: ContentChatServiceDependencies
): Promise<ContentChatSession> {
  const session = await loadContentChatSession(sessionId, dependencies.runtimeConfig.outputDir)
  const latestRevision = [...session.revisions].reverse().find((revision) => revision.validationStatus === "valid")

  if (!latestRevision?.validatedJson) {
    throw new CalendarValidationError(
      `Die Chat-Session "${sessionId}" enthält keine gültige Revision zum Übernehmen.`
    )
  }

  await applyRevisionToSource(session, latestRevision.validatedJson)

  const now = dependencies.now ?? (() => new Date())
  const appliedAt = now().toISOString()
  const updatedSession: ContentChatSession = {
    ...session,
    lastRevisionJson: latestRevision.validatedJson,
    sourceJson: latestRevision.validatedJson,
    revisions: session.revisions.map((revision) =>
      revision.id === latestRevision.id
        ? { ...revision, appliedAt }
        : revision
    ),
    updatedAt: appliedAt
  }

  await persistChatSession(updatedSession, dependencies.runtimeConfig.outputDir)

  return updatedSession
}

export function getChatSessionPath(outputRoot: string, sessionId: string): string {
  return join(outputRoot, "chat-sessions", `${sessionId}.json`)
}

function appendRevision(
  session: ContentChatSession,
  requestMessage: ContentChatMessage,
  revision: ContentChatRevision,
  now: () => Date
): ContentChatSession {
  const resultText =
    revision.validationStatus === "valid"
      ? `Revision validiert. ${revision.diff.length} Änderungen erkannt.`
      : `Revision ungültig. ${revision.validationErrors.length} Validierungsfehler gefunden.`

  return {
    ...session,
    lastRevisionJson:
      revision.validationStatus === "valid" ? revision.validatedJson : session.lastRevisionJson,
    messages: [
      ...session.messages,
      requestMessage,
      createMessage("assistant", "revision_result", resultText, now)
    ],
    revisions: [...session.revisions, revision],
    updatedAt: now().toISOString()
  }
}

function createMessage(
  role: ContentChatMessage["role"],
  kind: ContentChatMessage["kind"],
  content: string,
  now: () => Date
): ContentChatMessage {
  return {
    id: randomUUID(),
    role,
    kind,
    content,
    createdAt: now().toISOString()
  }
}

function createValidRevision(
  model: string,
  rawResponse: unknown,
  validatedJson: unknown,
  diff: string[],
  now: () => Date,
  patch: JsonPatch
): ContentChatRevision {
  return {
    appliedAt: null,
    createdAt: now().toISOString(),
    diff,
    id: randomUUID(),
    model,
    rawResponse,
    patch,
    validationErrors: [],
    validationStatus: "valid",
    validatedJson
  }
}

function createInvalidRevision(
  rawResponse: unknown,
  validationErrorText: string,
  now: () => Date,
  model = "unknown"
): ContentChatRevision {
  return {
    appliedAt: null,
    createdAt: now().toISOString(),
    diff: ["Keine Diff-Vorschau verfügbar, weil die Revision nicht gültig validiert werden konnte."],
    id: randomUUID(),
    model,
    patch: null,
    rawResponse,
    validationErrors: validationErrorText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    validationStatus: "invalid",
    validatedJson: null
  }
}

async function resolveChatContext(
  input: ContentChatSessionInput,
  dependencies: ContentChatServiceDependencies
): Promise<ResolvedChatContext> {
  if (input.contextType === "post") {
    const post = getPostById(dependencies.calendar, input.postId)
    const contentPath = getContentOutputPaths(dependencies.runtimeConfig.outputDir, post).contentPath

    return {
      contextRef: input.postId,
      contextType: "post",
      schemaName: "content_package",
      sourceJson: await readContentPackage(contentPath),
      sourceJsonPath: contentPath
    }
  }

  if (input.contextType === "week") {
    const week = getWeekForDate(dependencies.calendar, input.weekDate)

    return {
      contextRef: week.id,
      contextType: "week",
      schemaName: "calendar_week",
      sourceJson: week,
      sourceJsonPath: dependencies.runtimeConfig.calendarPath
    }
  }

  if (input.contextType === "plan") {
    const planPath = input.planPath ?? dependencies.runtimeConfig.calendarPath
    const calendar = await loadCalendarFromFile(planPath)

    return {
      contextRef: calendar.meta.titel,
      contextType: "plan",
      schemaName: "editorial_calendar",
      sourceJson: calendar,
      sourceJsonPath: planPath
    }
  }

  const schema = getParserForSchemaName(input.schemaName)
  return {
    contextRef: input.contextRef,
    contextType: "other",
    schemaName: input.schemaName,
    sourceJson: schema.parse(await readJsonFile(input.filePath)),
    sourceJsonPath: input.filePath
  }
}

async function persistChatSession(
  session: ContentChatSession,
  outputRoot: string
): Promise<void> {
  const sessionPath = getChatSessionPath(outputRoot, session.id)
  await mkdir(join(outputRoot, "chat-sessions"), { recursive: true })
  await writeJsonFile(sessionPath, session)
}

function buildDiscussionInstructions(session: ContentChatSession): string {
  return [
    "You are discussing an existing JSON document with a human editor.",
    "Respond in natural German prose.",
    "Do not return JSON unless explicitly asked to return a revised JSON document.",
    "Critique content clearly and concretely.",
    "Keep the existing schema in mind and do not propose fields outside it.",
    buildSchemaGuidance(session)
  ].join("\n")
}

function buildDiscussionInput(session: ContentChatSession, latestPrompt: string): string {
  return [
    `Kontexttyp: ${session.contextType}`,
    `Kontextreferenz: ${session.contextRef}`,
    `Schema: ${session.schemaName}`,
    "Ausgangs-JSON:",
    JSON.stringify(session.sourceJson, null, 2),
    "Bisheriger Chatverlauf:",
    formatConversationHistory(session.messages),
    "Neueste Benutzerfrage:",
    latestPrompt
  ].join("\n\n")
}

function buildRevisionInstructions(session: ContentChatSession, validationErrors: string[] = []): string {
  return [
    "You are producing a JSON Patch for the existing document, not a complete replacement document.",
    "Return exactly one patch object and nothing else: no Markdown fences, comments, prose, or placeholders.",
    "Use only add, remove, and replace operations with JSON Pointer paths beginning with /. Do not use move, copy, or test.",
    "The base_hash must exactly match the canonical source JSON hash supplied in the input.",
    "Preserve stable identifiers, structural keys, dates, and statuses unless the current context explicitly permits a change.",
    "Do not invent factual details for church, school, sermon, or community content.",
    "Use natural German content inside string values where content is rewritten.",
    ...(validationErrors.length > 0
      ? [
          "A previous attempt failed application validation. Correct every error below and return the patch again.",
          "EXACT VALIDATION ERRORS FROM THE APPLICATION:",
          ...validationErrors.map((error) => `- ${error}`)
        ]
      : []),
    buildSchemaGuidance(session),
    "The patch is applied and the resulting complete document is validated by the application against the source schema."
  ].join("\n")
}

function buildRevisionInput(
  session: ContentChatSession,
  validationErrors: string[] = [],
  _schema: Record<string, unknown> = getJsonSchemaForSession(session),
  instruction = ""
): string {
  return [
    `Kontexttyp: ${session.contextType}`,
    `Kontextreferenz: ${session.contextRef}`,
    `Schema: ${session.schemaName}`,
    "Verbindliches Patch-Schema für die Ausgabe:",
    JSON.stringify(getJsonPatchSchema(), null, 2),
    ...(instruction.trim().length > 0
      ? ["Direkte Änderungsanweisung des Benutzers:", instruction.trim()]
      : []),
    "Arbeite auf Basis dieses JSON-Dokuments. Verwende den folgenden kanonischen base_hash:",
    canonicalJsonHash(session.sourceJson),
    "Quelldokument:",
    JSON.stringify(session.sourceJson, null, 2),
    "Berücksichtige diesen Chatverlauf bei der Überarbeitung:",
    formatConversationHistory(session.messages),
    ...(validationErrors.length > 0
      ? [
          "Die vorige Ausgabe wurde von der Anwendung abgelehnt. Korrigiere den Patch anhand dieser exakten Fehler und sende danach wieder den Patch:",
          ...validationErrors.map((error) => `- ${error}`)
        ]
      : [])
  ].join("\n\n")
}

function buildSchemaGuidance(session: ContentChatSession): string {
  if (session.schemaName === "content_package") {
    return [
      "Schema guidance for content_package:",
      "- Preserve id, source.calendar_post_id, source.date, and status values unless a user explicitly requests otherwise.",
      "- Preserve arrays and nested objects in their existing structure.",
      "- story.slides must stay an array of objects with a text field.",
      "- Do not add extra top-level fields."
    ].join("\n")
  }

  if (session.schemaName === "calendar_week") {
    return [
      "Schema guidance for calendar_week:",
      "- Preserve week id, iso_kw, and date boundaries unless explicitly requested.",
      "- Keep every post schema-valid and preserve post ids.",
      "- Do not add fields outside the calendar week schema."
    ].join("\n")
  }

  return [
    "Schema guidance for editorial_calendar:",
    "- Preserve meta, workflow, source, and post structures exactly as defined by the schema.",
    "- Keep week ids and post ids stable.",
    "- Do not add fields outside the editorial calendar schema."
  ].join("\n")
}

function formatConversationHistory(messages: ContentChatMessage[]): string {
  if (messages.length === 0) {
    return "Noch kein Verlauf."
  }

  return messages
    .map(
      (message) =>
        `[${message.createdAt}] ${message.role}/${message.kind}: ${message.content}`
    )
    .join("\n")
}

function getJsonSchemaForSession(session: ContentChatSession): Record<string, unknown> {
  const schema = z.toJSONSchema(getParserForSchemaName(session.schemaName))

  if (schema.type !== "object") {
    throw new Error(`Expected object schema for ${session.schemaName}.`)
  }

  const normalizedSchema = { ...schema }
  delete normalizedSchema.$schema
  return normalizedSchema
}

function getParserForSchemaName(schemaName: SupportedSchemaName) {
  if (schemaName === "content_package") {
    return contentPackageSchema
  }

  if (schemaName === "calendar_week") {
    return calendarWeekSchema
  }

  return calendarSchema
}

function validateRevisionJson(schemaName: SupportedSchemaName, value: unknown) {
  return getParserForSchemaName(schemaName).safeParse(value)
}

async function applyRevisionToSource(
  session: ContentChatSession,
  revisedJson: unknown
): Promise<void> {
  if (!session.sourceJsonPath) {
    throw new CalendarValidationError(
      `Die Chat-Session "${session.id}" hat keinen schreibbaren Quellpfad.`
    )
  }

  if (session.contextType === "post" || session.contextType === "plan" || session.contextType === "other") {
    await writeJsonFile(session.sourceJsonPath, revisedJson)
    return
  }

  const fullCalendar = await loadCalendarFromFile(session.sourceJsonPath)
  const revisedWeek = calendarWeekSchema.parse(revisedJson)
  const updatedCalendar = {
    ...fullCalendar,
    wochen: fullCalendar.wochen.map((week) =>
      week.id === session.contextRef ? revisedWeek : week
    )
  }

  calendarSchema.parse(updatedCalendar)
  await writeJsonFile(session.sourceJsonPath, updatedCalendar)
}

function diffJsonValues(before: unknown, after: unknown): string[] {
  const changes: string[] = []
  collectJsonDiffs(before, after, "$", changes)
  return changes.length > 0 ? changes : ["Keine inhaltlichen Änderungen erkannt."]
}

export function canonicalJsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortJsonValue(value))).digest("hex")
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, sortJsonValue(entry)])
    )
  }

  return value
}

function getJsonPatchSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(jsonPatchSchema)
  delete schema.$schema
  return schema
}

function applyJsonPatch(source: unknown, patch: JsonPatch): unknown {
  const expectedHash = canonicalJsonHash(source)
  if (patch.base_hash !== expectedHash) {
    throw new Error("Der Patch bezieht sich auf einen veralteten JSON-Stand.")
  }

  let result = structuredClone(source)
  for (const operation of patch.operations) {
    result = applyJsonPatchOperation(result, operation)
  }

  return result
}

function applyJsonPatchOperation(
  source: unknown,
  operation: z.infer<typeof jsonPatchOperationSchema>
): unknown {
  const segments = operation.path.slice(1).split("/").map(unescapeJsonPointer)
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Ungültiger Patch-Pfad: ${operation.path}`)
  }

  const parentSegments = segments.slice(0, -1)
  const key = segments.at(-1) ?? ""
  const parent = getJsonPointerValue(source, parentSegments)

  if (Array.isArray(parent)) {
    const index = key === "-" ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length) {
      throw new Error(`Ungültiger Array-Index im Patch-Pfad: ${operation.path}`)
    }
    if (operation.op === "add") {
      parent.splice(index, 0, structuredClone(operation.value))
    } else if (operation.op === "replace" && index < parent.length) {
      parent[index] = structuredClone(operation.value)
    } else if (operation.op === "remove" && index < parent.length) {
      parent.splice(index, 1)
    } else {
      throw new Error(`Patch-Operation nicht möglich: ${operation.op} ${operation.path}`)
    }
    return source
  }

  if (parent === null || typeof parent !== "object") {
    throw new Error(`Patch-Elternpfad ist kein Objekt: ${operation.path}`)
  }

  const record = parent as Record<string, unknown>
  if (operation.op === "remove") {
    if (!(key in record)) throw new Error(`Feld nicht gefunden: ${operation.path}`)
    delete record[key]
  } else if (operation.op === "replace") {
    if (!(key in record)) throw new Error(`Feld nicht gefunden: ${operation.path}`)
    record[key] = structuredClone(operation.value)
  } else {
    if (key in record) throw new Error(`Feld bereits vorhanden: ${operation.path}`)
    record[key] = structuredClone(operation.value)
  }

  return source
}

function getJsonPointerValue(source: unknown, segments: string[]): unknown {
  let current = source
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`Ungültiger Patch-Pfad: /${segments.join("/")}`)
      }
      current = current[index]
    } else if (current !== null && typeof current === "object" && segment in current) {
      current = (current as Record<string, unknown>)[segment]
    } else {
      throw new Error(`Patch-Elternpfad nicht gefunden: /${segments.join("/")}`)
    }
  }
  return current
}

function unescapeJsonPointer(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~")
}

function formatValidationIssueInGerman(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "<Wurzel>"
  return `${path}: ${translateZodMessage(issue.message)}`
}

function translateZodMessage(message: string): string {
  if (message === "Invalid input") {
    return "Ungültiger Wert."
  }

  if (message.startsWith("Invalid input: expected string")) {
    return "Ungültiger Wert: Text erwartet."
  }

  if (message.startsWith("Invalid input: expected number")) {
    return "Ungültiger Wert: Zahl erwartet."
  }

  if (message.startsWith("Invalid input: expected boolean")) {
    return "Ungültiger Wert: Wahr/Falsch erwartet."
  }

  if (message.startsWith("Invalid input: expected array")) {
    return "Ungültiger Wert: Liste erwartet."
  }

  if (message.startsWith("Invalid input: expected object")) {
    return "Ungültiger Wert: Objekt erwartet."
  }

  if (message.startsWith("Too small: expected string")) {
    return "Der Text ist zu kurz."
  }

  if (message.startsWith("Too small: expected array")) {
    return "Die Liste enthält zu wenige Einträge."
  }

  if (message.startsWith("Invalid string: must match pattern")) {
    return "Das Textformat passt nicht zum erwarteten Muster."
  }

  return message
}

function collectJsonDiffs(
  before: unknown,
  after: unknown,
  path: string,
  changes: string[]
): void {
  if (Object.is(before, after)) {
    return
  }

  if (before === null || after === null || typeof before !== "object" || typeof after !== "object") {
    if (before === undefined) {
      changes.push(`${path}: hinzugefügt`)
      return
    }

    if (after === undefined) {
      changes.push(`${path}: entfernt`)
      return
    }

    changes.push(`${path}: geändert`)
    return
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) {
      changes.push(`${path}: Typ geändert`)
      return
    }

    if (before.length !== after.length) {
      changes.push(`${path}: Array-Länge ${before.length} → ${after.length}`)
    }

    const length = Math.max(before.length, after.length)

    for (let index = 0; index < length; index += 1) {
      collectJsonDiffs(before[index], after[index], `${path}[${index}]`, changes)
    }

    return
  }

  const beforeRecord = before as Record<string, unknown>
  const afterRecord = after as Record<string, unknown>
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])

  for (const key of keys) {
    collectJsonDiffs(beforeRecord[key], afterRecord[key], `${path}.${key}`, changes)
  }
}
