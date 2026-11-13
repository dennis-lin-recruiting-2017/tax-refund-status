// The color schemes a signed-in user can pick. Their colors live in styles.css under :root[data-scheme]; the
// server keeps the same list of ids (migration 014) and each role's default (auth.defaultSchemeSQL):
// taxpayers Sunset, support Ocean, admins Graphite.
export const SCHEMES = [
  { id: 'evergreen', label: 'Evergreen' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'plum', label: 'Plum' },
  { id: 'graphite', label: 'Graphite' },
]

export const DEFAULT_SCHEME = 'sunset' // fallback only; the server sends each user's scheme, with their role's default
export const PUBLIC_SCHEME = 'evergreen' // every page shown while signed out

const STORAGE_KEY = 'colorScheme'

const valid = (id) => SCHEMES.some((s) => s.id === id)

// Applies a signed-in user's scheme and remembers it on this device, so their next visit starts in it before
// anything is drawn (see public/scheme.js). The profile copy is the one that travels between devices.
export function applyScheme(id) {
  const scheme = valid(id) ? id : DEFAULT_SCHEME
  document.documentElement.dataset.scheme = scheme
  try {
    localStorage.setItem(STORAGE_KEY, scheme)
  } catch {
    // Storage can be blocked; the scheme still applies for this visit.
  }
  return scheme
}

// Signed-out pages always use the public scheme. The device's remembered scheme is left alone, so the user
// is back in theirs as soon as they sign in.
export function applyPublicScheme() {
  document.documentElement.dataset.scheme = PUBLIC_SCHEME
}
