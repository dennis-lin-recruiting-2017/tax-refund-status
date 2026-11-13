// Runs before the app, so a signed-in user's scheme is applied before the first paint, with no flash of
// another one. The sign-in page always uses Evergreen, whatever this device remembers. A separate file
// rather than an inline script, because the CSP allows only same-origin scripts. Keep the ids in step with
// src/schemes.js.
try {
  var s = location.pathname === '/login' ? 'evergreen' : localStorage.getItem('colorScheme')
  if (['evergreen', 'ocean', 'sunset', 'plum', 'graphite'].indexOf(s) >= 0) document.documentElement.dataset.scheme = s
} catch (e) {}
