# Frontend

The taxpayer portal: sign in, file a sample Form 1040 and a return for each state they file in (CA 540 or 540NR, NY IT-201 or IT-203), and track each refund. React + Vite, with no state library or CSS framework.

```bash
npm install
```

```bash
npm run dev
```

The dev server runs on http://localhost:5180 and proxies `/api` to the Go backend on `:8080`. Set `API_URL` to proxy somewhere else.

## Pages

| Route | |
| --- | --- |
| `/login` | Sign in with a seeded demo account. |
| `/` | Your returns: a status timeline, history, and calculation for each. Polls every 4 seconds while a return is in flight. |
| `/file/1040`, `/file/540` | Enter W-2 figures and direct deposit details, review the server's calculation, then submit. |

## In containers

The [`Dockerfile`](Dockerfile) builds the app and serves it with `nginx-unprivileged` on port 8080. [`nginx.conf`](nginx.conf):

- Serves the SPA with a fallback to `index.html`.
- Proxies `/api/` to `http://backend:8080` (the Compose service and the Kubernetes Service name), so the browser only ever talks to one origin.
- Sets a strict Content Security Policy (`default-src 'self'`, no inline scripts or styles), plus `X-Frame-Options: DENY`, `nosniff`, and `no-referrer`.

Sessions use an `HttpOnly` cookie that JavaScript can't read. Every state-changing request sends `X-Requested-With: fetch`, which the backend requires.
