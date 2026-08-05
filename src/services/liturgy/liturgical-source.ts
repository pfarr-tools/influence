import { z } from "zod"

import type { CalendarSourceReference } from "../../domain/calendar.js"

const nonEmptyStringSchema = z.string().min(1)

const liturgicalVerseSchema = z.object({
  Bibelstelle: nonEmptyStringSchema,
  Text: nonEmptyStringSchema,
  URL: nonEmptyStringSchema
})

const liturgicalDayEntrySchema = z.object({
  Code: z.string().optional(),
  Bezeichnung: z.string().optional(),
  Titel: z.string().optional(),
  Wochenspruch: z.unknown().optional()
})

const liturgicalYearSchema = z.object({
  Tage: z.record(z.string(), z.array(z.unknown()))
})

export interface LiturgicalTextReference {
  citation: string
  text: string
  url: string
}

export interface LiturgicalDayEntry {
  code: string
  label: string
  title: string
  weeklyVerse?: LiturgicalTextReference
}

export interface LiturgicalContext {
  entries: LiturgicalDayEntry[]
  sourceDate: string
  sourcePath: string
  warnings: string[]
  weeklyVerse?: LiturgicalTextReference
}

export interface LiturgicalSourceClient {
  loadContext(
    sourceReference: CalendarSourceReference
  ): Promise<LiturgicalContext | undefined>
}

export function createLiturgicalSourceClient(
  fetchImpl: typeof fetch = fetch
): LiturgicalSourceClient {
  const yearDocumentCache = new Map<string, Promise<z.infer<typeof liturgicalYearSchema>>>()

  return {
    async loadContext(
      sourceReference: CalendarSourceReference
    ): Promise<LiturgicalContext | undefined> {
      const yearDocument = await getYearDocument(
        sourceReference.jahr_endpoint,
        yearDocumentCache,
        fetchImpl
      )
      const dayEntries = yearDocument.Tage[sourceReference.datum]

      if (!dayEntries || dayEntries.length === 0) {
        return {
          entries: [],
          sourceDate: sourceReference.datum,
          sourcePath: sourceReference.json_pfad,
          warnings: [
            `No liturgical entries were found for ${sourceReference.datum} at ${sourceReference.jahr_endpoint}.`
          ]
        }
      }

      const entries = dayEntries.map(normalizeDayEntry)

      const uniqueWeeklyVerses = getUniqueWeeklyVerses(entries)
      const warnings: string[] = []

      if (entries.length > 1 && uniqueWeeklyVerses.length > 1) {
        warnings.push(
          `Multiple liturgical entries for ${sourceReference.datum} contain different Wochenspruch values. Local selection is still required before publication.`
        )
      }

      if (uniqueWeeklyVerses.length === 0) {
        warnings.push(
          `The liturgical source for ${sourceReference.datum} does not expose a Wochenspruch text.`
        )
      }

      return {
        entries,
        sourceDate: sourceReference.datum,
        sourcePath: sourceReference.json_pfad,
        warnings,
        weeklyVerse:
          uniqueWeeklyVerses.length === 1 ? uniqueWeeklyVerses[0] : undefined
      }
    }
  }
}

async function getYearDocument(
  endpoint: string,
  cache: Map<string, Promise<z.infer<typeof liturgicalYearSchema>>>,
  fetchImpl: typeof fetch
): Promise<z.infer<typeof liturgicalYearSchema>> {
  const cachedDocument = cache.get(endpoint)

  if (cachedDocument) {
    return cachedDocument
  }

  const documentPromise = fetchYearDocument(endpoint, fetchImpl)
  cache.set(endpoint, documentPromise)

  return documentPromise
}

async function fetchYearDocument(
  endpoint: string,
  fetchImpl: typeof fetch
): Promise<z.infer<typeof liturgicalYearSchema>> {
  const response = await fetchImpl(endpoint)

  if (!response.ok) {
    throw new Error(
      `Failed to load liturgical source ${endpoint}: ${response.status} ${response.statusText}`
    )
  }

  return liturgicalYearSchema.parse(await response.json())
}

function normalizeDayEntry(rawEntry: unknown): LiturgicalDayEntry {
  const entry = liturgicalDayEntrySchema.parse(rawEntry)
  const parsedWeeklyVerse = liturgicalVerseSchema.safeParse(entry.Wochenspruch)

  return {
    code: entry.Code ?? "",
    label: entry.Bezeichnung ?? "",
    title: entry.Titel ?? "",
    weeklyVerse: parsedWeeklyVerse.success
      ? {
          citation: parsedWeeklyVerse.data.Bibelstelle,
          text: parsedWeeklyVerse.data.Text,
          url: parsedWeeklyVerse.data.URL
        }
      : undefined
  }
}

function getUniqueWeeklyVerses(
  entries: LiturgicalDayEntry[]
): LiturgicalTextReference[] {
  const weeklyVerseMap = new Map<string, LiturgicalTextReference>()

  for (const entry of entries) {
    if (!entry.weeklyVerse) {
      continue
    }

    const key = [
      entry.weeklyVerse.citation.trim(),
      entry.weeklyVerse.text.trim(),
      entry.weeklyVerse.url.trim()
    ].join("::")

    if (!weeklyVerseMap.has(key)) {
      weeklyVerseMap.set(key, entry.weeklyVerse)
    }
  }

  return [...weeklyVerseMap.values()]
}
