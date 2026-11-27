# flashmobile-client

Phone-first flashcards (Vue 3 + Vuetify, installable PWA) that study the words of LCT. Data comes from
`flashmobile-server`; this repo holds no dictionary data.

Screens: login -> deck screen (tap a dictionary to study it at once; the tag button of a dictionary opens its tags; the status filter is on top) -> study (front, then tap for the meaning,
tap again to turn the card over to the details: Sino-Viet, pitch, kanji blocks with stroke-order player, notes,
related words; Again / Learned / Skip; swipe or arrows to change word; speech) -> summary; settings (font size,
show reading / meaning / Hán Việt, dark mode, language; the admin picks the voice: ElevenLabs, Google or the phone's own).

Deck screen (`DeckView.vue`): a tap anywhere on a dictionary's card studies it at once, with the status filter on top (New + Learning by default) and
the tags remembered for THAT dictionary. There is no Start button on the screen: the tags of a dictionary are chosen from its tag button (a sheet
with the tags and its own 始める button), and each dictionary keeps its own tags (`flashmobile.deckPick.<user>` = `{ deckId (the one studied last),
statuses, tagsByDeck }`; the older `{ deckId, tags, statuses }` is read too). The tags chosen for a dictionary show on its card on one line, as many as
fit and the rest as "+N" (`TagChips.vue`, measured on a hidden copy of the chips); the tag button carries the number of tags chosen. The square tile of
a card (with a small list mark in its corner) opens the word list of the whole dictionary. While a dictionary loads its card shows a spinner and
no other card can be started.

Kanji sheet: the stroke-order player has a pencil button for **handwriting practice**. It opens a screen of its own in place of the
sheet's content (like a component opened from the graph, with a Back button; `KanjiPractice.vue`) that holds only the question (Sino-Viet
sound, meaning, readings, number of strokes, the parts under a folded "Memory hint") and a big drawing area (`StrokePractice.vue`), not the
kanji itself: it is written from memory, and the kanji shows up when the writing is finished or when the faint outline is turned on.
Each stroke is checked when the finger lifts (`src/lib/strokeMatch.ts`): its direction, its place and its rough shape against the KanjiVG
stroke (the quality of the line is not judged). A right stroke is replaced by the clean one (green flash); a wrong one makes the frame shake
and flash red, stays red with a dot where it began, and the right stroke is drawn in green with its number, a start dot and an arrow at its
end, plus a short reason (wrong direction, shape or place, too short / long, or a stroke that comes later). Writing from memory that happens
from the second wrong try on a stroke; with the outline on, at once. Buttons: faint outline on/off (trace), show the next stroke, start
again. Finishing is shown by a red seal on the kanji (合 = no wrong stroke and no peeking at the outline or the hint button, 済 = done) with
a ✓ count and a ✗ count of wrong tries, not by a sentence.
It is meant to feel like writing with a brush: with a mouse (or a pen) the pointer is a brush drawn in the picture, its tip where the ink
goes, a little spread while it is down; the stroke being written is thick where the hand is slow, thin where it is fast, and swells at the
start (`src/lib/brushStroke.ts`). When the check refuses a stroke that was right, "My stroke was right" accepts it and keeps it, with the
reason it was refused, on this device only (`src/lib/strokeSamples.ts`, up to 300; Settings > Handwriting copies them out as JSON or clears
them) to tune the check with. Settings > Handwriting also sets how strictly strokes are checked (Strict / Normal / Loose = tolerance
0.8 / 1 / 1.4); that choice, like the tooltip switch, stays on the device and is not synced to the server. The leniency is the `tolerance` argument of `matchStroke` / `judgeStroke`
(1 = default, higher forgives more).

Step-by-step guide (local run, build, deploy) in Vietnamese: [`../HUONG-DAN.md`](../HUONG-DAN.md).

## Run locally

```bash
npm install
cp .env.example .env.development.local   # VITE_API_URL=http://localhost:8787  VITE_LOGIN=true|false  VITE_VOICES_URL=...
npm run dev                      # http://localhost:5173  (start the server first)
npm test
npm run build                    # reads .env.production.local (the Render URL); needs VITE_BASE=/<repo>/ for Pages
```

Env files: `npm run dev` reads `.env`, `.env.local`, `.env.development*`; `npm run build` reads `.env`, `.env.local`,
`.env.production*`; later files win. `.env.example` is never read. Values are baked in at build time.

`VITE_VOICES_URL` is the host of the MP3 voice files: the sibling [`../voices`](../voices) folder, deployed as the separate
`tango-voices` Worker (see `../voices/README.md`). It is baked in at build time; when it is empty or unset the app looks in
its own `public/voices` instead. The voice files are not part of this build.

`VITE_LOGIN=false` runs against a server with `AUTH=off` (then `VITE_API_KEY` must match its `API_KEY`). With the
default `true` the app asks for a username and password (users are rows of the `users` tab of the server's Google Sheet;
for a local server use `AUTH=local LOCAL_USERS=alice:pw1`).

Open the dev URL on your phone through your PC's LAN address (`npm run dev -- --host`) while the server runs
with `CORS_ORIGIN='*'`.

## Deploy on GitHub Pages

Option A, build on your PC (no Actions storage quota involved):

1. `.env.production.local`: `VITE_API_URL=https://<service>.onrender.com`, `VITE_LOGIN=true` and
   `VITE_VOICES_URL=https://tango-voices.<subdomain>.workers.dev/`.
2. `$env:VITE_BASE = "/<repo>/"; npm run build; npx gh-pages -d dist`
3. Repo settings > Pages > Source: **Deploy from a branch** > `gh-pages` / root.

Option B, GitHub Actions: Pages > Source: **GitHub Actions**; Settings > Secrets and variables > Actions > **Variables**:
`VITE_API_URL`, `VITE_VOICES_URL` (and `VITE_API_KEY` only for a server without login). Push to `main`; `.github/workflows/pages.yml` builds
with `VITE_BASE=/<repo>/` and publishes. (Fails with "Artifact storage quota" when the account's Actions storage is full: use A.)

Then on the server set `CORS_ORIGIN=https://<user>.github.io` and on Android Chrome open the site > menu >
**Add to Home screen**.

## Behaviour worth knowing

- Test (`views/TestView.vue`, `lib/quiz.ts`): the test button of a deck opens a sheet (number of questions, question type, optional status filter) and starts a multiple-choice test of that deck (tags remembered for the deck). Two kinds: a word is shown and its meaning is picked, or a word is heard and the Japanese word is picked (a single kanji is only asked by meaning); a question can be skipped, and the test ended early (what is left stays "not done", not wrong). The wrong answers are other words of the deck that look alike, drawn at random for each new test. The whole test (questions and options) is saved to the server (D1) when it is made, each answer as it is given, and it is marked done at the end, so it can be left and continued from any device: menu > Kiểm tra (`views/TestHistoryView.vue`) lists unfinished tests (Continue) and finished ones, with the score by kind. The list is read from the server, not cached. Steps that could not be sent wait in a per-user queue in localStorage (`flashmobile.testQueue.<user>`) and are resent in order.
- A free Render server sleeps: the first load shows "waking the server" for ~30-60 s.
- Every result is queued in the phone's storage and sent in order; if the server is unreachable it is retried when
  the app is opened again or the phone is back online. The server ignores a repeat of the same result.
- Login: `src/auth.ts` keeps the token in localStorage, `src/api.ts` sends it as `Authorization: Bearer`, and the
  `beforeEach` guard in `src/router.ts` sends everyone without a token to `/login`. A 401 from the server signs the user
  out. Results still queued from another user are dropped on a different login. Nothing else talks to the server.
- Speech: the speaker reads only the word (kana reading if any). `src/lib/speech.ts` asks the server for an ElevenLabs
  MP3, keeps each one in Cache Storage (so a word is paid for once, and plays offline), and falls back to the device
  voice when the server has none or the Settings switch is off. While a word plays the speaker takes the colour of its
  source and a short note names it (`src/lib/voiceBadge.ts`). A cached word keeps `x-voice-origin` and `x-voice-url`
  headers, so DevTools > Application > Cache Storage shows where it was fetched from.
- Web (mouse): arrow buttons at the card's sides and mouse drag change the word; keys: arrows, Space, 1, 2, P.
