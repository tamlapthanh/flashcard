# flashmobile-client

Phone-first flashcards (Vue 3 + Vuetify, installable PWA) that study the words of LCT. Data comes from
`flashmobile-server`; this repo holds no dictionary data.

Screens: deck picker (dictionary, tags, status, direction, size) -> study (front / back with furigana + pitch,
kanji blocks with stroke-order player, related-word sheet, Again / Learned / Skip, swipe, speech) -> summary;
settings (font size, show reading, dark mode).

## Run locally

```bash
npm install
cp .env.example .env.local      # VITE_API_URL=http://localhost:8787  VITE_API_KEY=dev-key
npm run dev                      # http://localhost:5173  (start the server first)
npm test
```

Open the dev URL on your phone through your PC's LAN address (`npm run dev -- --host`) while the server runs
with `CORS_ORIGIN='*'`.

## Deploy on GitHub Pages

1. Repo settings > Pages > Source: **GitHub Actions**.
2. Repo settings > Secrets and variables > Actions > **Variables**: add `VITE_API_URL`
   (`https://<service>.onrender.com`) and `VITE_API_KEY` (the server's `API_KEY`).
   The key ends up in the built JavaScript: it is a temporary fence, not a secret. Real protection comes with login.
3. Push to `main`; `.github/workflows/pages.yml` builds with `VITE_BASE=/<repo>/` and publishes.
4. On the server set `CORS_ORIGIN=https://<user>.github.io`.
5. On Android Chrome open the site > menu > **Add to Home screen**.

## Behaviour worth knowing

- A free Render server sleeps: the first load shows "waking the server" for ~30-60 s.
- Every result is queued in the phone's storage and sent in order; if the server is unreachable it is retried when
  the app is opened again or the phone is back online. The server ignores a repeat of the same result.
- Login later: add a `/login` route + `beforeEach` guard in `src/router.ts` and put the token in `authHeaders()` in
  `src/api.ts`. Nothing else talks to the server.
