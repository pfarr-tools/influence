/** Returns whether text contains an HTTP(S) URL that platforms can render as a link preview. */
export function containsUrl(text: string): boolean {
  return /\bhttps?:\/\/[^\s]+/i.test(text)
}
