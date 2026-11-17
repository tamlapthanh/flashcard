# flashmobile-client

Phone-first flashcards (Vue 3 + Vuetify, installable PWA) that study the words of LCT. Data comes from
`flashmobile-server`; this repo holds no dictionary data.

Screens: login -> deck picker (dictionary, tags, status, direction, size) -> study (front, then tap for the meaning,
tap again to turn the card over to the details: Sino-Viet, pitch, kanji blocks with stroke-order player, notes,
related words; Again / Learned / Skip; swipe or arrows to change word; speech) -> summary; settings (font size,
show reading / meaning / Hán Việt, natural voice, dark mode, language).

Step-by-step guide (local run, build, deploy) in Vietnamese: [`../HUONG-DAN.md`](../HUONG-DAN.md).

## Run locally

```bash
npm install
cp .env.example .env.development.local   # VITE_API_URL=http://localhost:8787  VITE_LOGIN=true|false
npm run dev                      # http://localhost:5173  (start the server first)
npm test
npm run build                    # reads .env.production.local (the Render URL); needs VITE_BASE=/<repo>/ for Pages
```

Env files: `npm run dev` reads `.env`, `.env.local`, `.env.development*`; `npm run build` reads `.env`, `.env.local`,
`.env.production*`; later files win. `.env.example` is never read. Values are baked in at build time.

`VITE_LOGIN=false` runs against a server with `AUTH=off` (then `VITE_API_KEY` must match its `API_KEY`). With the
default `true` the app asks for a username and password (users are rows of the `users` tab of the server's Google Sheet;
for a local server use `AUTH=local LOCAL_USERS=alice:pw1`).

Open the dev URL on your phone through your PC's LAN address (`npm run dev -- --host`) while the server runs
with `CORS_ORIGIN='*'`.

## Deploy on GitHub Pages

Option A, build on your PC (no Actions storage quota involved):

1. `.env.production.local`: `VITE_API_URL=https://<service>.onrender.com` and `VITE_LOGIN=true`.
2. `$env:VITE_BASE = "/<repo>/"; npm run build; npx gh-pages -d dist`
3. Repo settings > Pages > Source: **Deploy from a branch** > `gh-pages` / root.

Option B, GitHub Actions: Pages > Source: **GitHub Actions**; Settings > Secrets and variables > Actions > **Variables**:
`VITE_API_URL` (and `VITE_API_KEY` only for a server without login). Push to `main`; `.github/workflows/pages.yml` builds
with `VITE_BASE=/<repo>/` and publishes. (Fails with "Artifact storage quota" when the account's Actions storage is full: use A.)

Then on the server set `CORS_ORIGIN=https://<user>.github.io` and on Android Chrome open the site > menu >
**Add to Home screen**.

## Behaviour worth knowing

- A free Render server sleeps: the first load shows "waking the server" for ~30-60 s.
- Every result is queued in the phone's storage and sent in order; if the server is unreachable it is retried when
  the app is opened again or the phone is back online. The server ignores a repeat of the same result.
- Login: `src/auth.ts` keeps the token in localStorage, `src/api.ts` sends it as `Authorization: Bearer`, and the
  `beforeEach` guard in `src/router.ts` sends everyone without a token to `/login`. A 401 from the server signs the user
  out. Results still queued from another user are dropped on a different login. Nothing else talks to the server.
- Speech: the speaker reads only the word (kana reading if any). `src/lib/speech.ts` asks the server for an ElevenLabs
  MP3, keeps each one in Cache Storage (so a word is paid for once, and plays offline), and falls back to the device
  voice when the server has none or the Settings switch is off.
- Web (mouse): arrow buttons at the card's sides and mouse drag change the word; keys: arrows, Space, 1, 2, P.
