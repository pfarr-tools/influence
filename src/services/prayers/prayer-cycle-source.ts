import { JSDOM } from "jsdom"

const DEFAULT_OVERVIEW_URL = "https://www.oikoumene.org/de/resources/prayer-cycle"

export interface PrayerCycleItem {
  kind: "thanksgiving" | "intercession"
  text: string
}

export interface PrayerCycleResult {
  region: string
  weekStart: string
  weekEnd: string
  items: PrayerCycleItem[]
  selectedIntention: PrayerCycleItem
  sourceUrl: string
}

export interface PrayerCycleSourceClient {
  loadForDate(date: string): Promise<PrayerCycleResult>
}

interface PrayerCycleSourceOptions {
  fetch?: typeof fetch
  overviewUrl?: string
}

export function createPrayerCycleSourceClient(
  options: PrayerCycleSourceOptions = {}
): PrayerCycleSourceClient {
  const fetcher = options.fetch ?? fetch
  const overviewUrl = options.overviewUrl ?? DEFAULT_OVERVIEW_URL

  return {
    async loadForDate(date) {
      const overview = await loadHtml(fetcher, overviewUrl)
      const week = findWeek(overview, date)
      if (!week) {
        throw new Error(`The prayer cycle has no published week for ${date}.`)
      }

      const detailUrl = new URL(week.href, overviewUrl).toString()
      const detail = await loadHtml(fetcher, detailUrl)
      const document = detail.window.document
      const items = [
        ...readItems(document, "Wir danken", "thanksgiving"),
        ...readItems(document, "Wir beten für", "intercession")
      ]

      if (items.length === 0) {
        throw new Error(`The prayer cycle week at ${detailUrl} contains no prayer intentions.`)
      }

      const weekdayOffset = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

      return {
        region: cleanText(document.querySelector("h1")?.textContent ?? week.region),
        weekStart: week.start,
        weekEnd: week.end,
        items,
        selectedIntention: items[weekdayOffset % items.length]!,
        sourceUrl: detailUrl
      }
    }
  }
}

async function loadHtml(fetcher: typeof fetch, url: string): Promise<JSDOM> {
  const response = await fetcher(url)
  if (!response.ok) {
    throw new Error(`Could not load prayer cycle source ${url}: ${response.status} ${response.statusText}`)
  }

  return new JSDOM(await response.text(), { url })
}

function findWeek(document: JSDOM, date: string): { end: string; href: string; region: string; start: string } | undefined {
  for (const link of Array.from(document.window.document.querySelectorAll<HTMLAnchorElement>("a[href*='/prayer-cycle/']"))) {
    let block: Element | null = link
    for (let depth = 0; depth < 4 && block; depth += 1) {
      const range = parseDateRange(block.textContent ?? "")
      if (range && date >= range.start && date <= range.end) {
        return { ...range, href: link.href, region: cleanText(link.textContent ?? "") }
      }
      block = block.parentElement
    }
  }

  return undefined
}

function readItems(
  document: Document,
  headingText: string,
  kind: PrayerCycleItem["kind"]
): PrayerCycleItem[] {
  const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .find((candidate) => cleanText(candidate.textContent ?? "").startsWith(headingText))
  let list: Element | undefined
  let sibling = heading?.nextElementSibling
  while (sibling) {
    if (sibling.matches("ul")) {
      list = sibling
      break
    }
    if (sibling.matches("h1, h2, h3, h4, h5, h6")) break
    sibling = sibling.nextElementSibling
  }

  return Array.from(list?.querySelectorAll("li") ?? [])
    .map((item) => cleanText(item.textContent ?? ""))
    .filter(Boolean)
    .map((text) => ({ kind, text }))
}

function parseDateRange(text: string): { end: string; start: string } | undefined {
  const normalized = cleanText(text)
  const crossMonth = normalized.match(/(\d{1,2})\s+([\p{L}]+)\s*-\s*(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/u)
  const sameMonth = normalized.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/u)

  if (crossMonth) {
    const start = toIsoDate(Number(crossMonth[1]), crossMonth[2]!, Number(crossMonth[5]))
    const end = toIsoDate(Number(crossMonth[3]), crossMonth[4]!, Number(crossMonth[5]))
    return start && end ? { start, end } : undefined
  }

  if (sameMonth) {
    const year = Number(sameMonth[4])
    const month = monthNumber(sameMonth[3]!)
    if (!month) return undefined
    return {
      start: `${year}-${String(month).padStart(2, "0")}-${String(Number(sameMonth[1])).padStart(2, "0")}`,
      end: `${year}-${String(month).padStart(2, "0")}-${String(Number(sameMonth[2])).padStart(2, "0")}`
    }
  }

  return undefined
}

function toIsoDate(day: number, monthName: string, year: number): string | undefined {
  const month = monthNumber(monthName)
  return month
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : undefined
}

function monthNumber(value: string): number | undefined {
  const months: Record<string, number> = {
    januar: 1, january: 1, februar: 2, february: 2, märz: 3, maerz: 3, march: 3,
    april: 4, mai: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7, august: 8,
    september: 9, oktober: 10, october: 10, november: 11, dezember: 12, december: 12
  }
  return months[value.toLowerCase()]
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}
