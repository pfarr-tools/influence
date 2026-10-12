/** Returns whether text contains an HTTP(S) URL that platforms can render as a link preview. */
export function containsUrl(text: string): boolean {
  return /\bhttps?:\/\/[^\s]+/i.test(text)
}

const maxSocialTextGraphemes = 300

/** Limits text for platforms whose post limit is 300 graphemes. */
export function limitSocialText(text: string): string {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((segment) => segment.segment)
  if (graphemes.length <= maxSocialTextGraphemes) return text
  return graphemes.slice(0, maxSocialTextGraphemes - 3).join("") + "..."
}
