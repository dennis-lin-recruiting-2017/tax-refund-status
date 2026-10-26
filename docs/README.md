# Tax Refund Status — Design Docs

A React single-page app documenting the design of a service that lets taxpayers check the status of their most recent refund after filing. It's one part of the larger repo; see the [root README](../README.md).

Run all commands below from this `docs/` directory.

## Develop

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push the repo to GitHub on the `main` branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` that changes `docs/` runs `.github/workflows/deploy.yml` (at the repo root), which builds and publishes `docs/dist/`.

The app uses a relative Vite `base` and `HashRouter`, so it works at `https://<user>.github.io/<repo>/` with no repo-specific config and no 404 redirect tricks.

## Adding pages

- Nav structure lives in `src/navigation.js`. Nest `children` to any depth.
- To give a nav item real content, create a component in `src/pages/` and register it in the `pages` map in `src/App.jsx` by the node's `id`. Unregistered items show a placeholder.
