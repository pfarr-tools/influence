export function formatGermanDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`))
}

export function formatGermanLongDate(date: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`))
}

export function getIsoWeekNumber(date: string): number {
  const target = new Date(`${date}T00:00:00`)
  const dayNumber = (target.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNumber + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstThursdayDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDay + 3)
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000)
}

export function formatWeekRangeLabel(startDate: string, endDate: string): string {
  return `KW ${String(getIsoWeekNumber(startDate)).padStart(2, "0")} · ${formatGermanDate(startDate)} bis ${formatGermanDate(endDate)}`
}
