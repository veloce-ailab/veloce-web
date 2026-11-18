// Helpers for the third-party token authorization page (/authorize).
//
// An external application opens
//   /authorize?state=<app state>&redirect_uri=<app callback>&app_name=<name>
// The page lets the signed-in user pick or create one of their API tokens and
// approve the request. The browser is then sent back to redirect_uri carrying
// only the application's own state; the application redeems that state through
// POST /api/oauth/token to obtain the token. The token itself never travels
// through a redirected URL.

const statePattern = /^[A-Za-z0-9._~-]{32,256}$/
const blockedSchemes = new Set(["javascript", "data", "file", "vbscript", "blob", "about"])

export interface TokenAuthorizeRequest {
  state: string
  redirectUri: string
  appName: string
}

export interface TokenAuthorizeParseResult {
  request: TokenAuthorizeRequest | null
  error: string
}

export function isValidTokenAuthorizeState(value: string) {
  return statePattern.test(value)
}

// Mirrors the server-side rule so the page can show a precise message before
// the user tries to approve. The server still validates everything itself.
export function normalizeTokenAuthorizeRedirectURI(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 2048) {
    return ""
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return ""
  }
  if (parsed.hash || parsed.username || parsed.password) {
    return ""
  }
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase()
  if (!scheme || blockedSchemes.has(scheme)) {
    return ""
  }
  if (scheme === "https") {
    return parsed.host ? trimmed : ""
  }
  if (scheme === "http") {
    const host = parsed.hostname.toLowerCase()
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" ? trimmed : ""
  }
  // Custom scheme such as com.example.app://callback.
  if (!scheme.includes(".") || !/^[a-z0-9.+-]+$/.test(scheme)) {
    return ""
  }
  return parsed.host ? trimmed : ""
}

export function sanitizeTokenAuthorizeAppName(raw: string) {
  const cleaned = Array.from(raw)
    .filter((char) => {
      const code = char.codePointAt(0) || 0
      return code >= 0x20 && code !== 0x7f
    })
    .join("")
    .trim()
  return cleaned.slice(0, 64)
}

export function readTokenAuthorizeRequest(search: string): TokenAuthorizeParseResult {
  const params = new URLSearchParams(search)
  const state = params.get("state") || ""
  const redirectURI = params.get("redirect_uri") || ""
  const appName = sanitizeTokenAuthorizeAppName(params.get("app_name") || "")

  if (!isValidTokenAuthorizeState(state)) {
    return { request: null, error: "state" }
  }
  const normalizedRedirect = normalizeTokenAuthorizeRedirectURI(redirectURI)
  if (!normalizedRedirect) {
    return { request: null, error: "redirect_uri" }
  }
  return { request: { state, redirectUri: normalizedRedirect, appName }, error: "" }
}

// Where the page should send the user when the request is denied. The app gets
// an explicit error instead of a token.
export function tokenAuthorizeErrorCallback(redirectUri: string, params: Record<string, string>) {
  try {
    const url = new URL(redirectUri)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    return url.toString()
  } catch {
    return ""
  }
}

export function tokenAuthorizeReturnPath(search: string) {
  return `/authorize${search.startsWith("?") ? search : `?${search}`}`
}

export function describeTokenAuthorizeTarget(redirectUri: string) {
  try {
    const url = new URL(redirectUri)
    return url.protocol === "http:" || url.protocol === "https:" ? url.host : `${url.protocol}//${url.host}`
  } catch {
    return redirectUri
  }
}
