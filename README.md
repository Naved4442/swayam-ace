# SWAYAM ACE

SWAYAM ACE is a static-first Wildlife Ecology study product for preparing with the supplied 12-week assignment solution papers. It combines short practice sessions, mock-test entry points, targeted revision, bookmarks, local progress, and light/dark themes in one responsive browser experience.

## Features

- **Practice studio:** randomized question sessions with immediate answer checking, source-traced answer feedback, previous/next navigation, and bookmarks.
- **Mock tests:** an exam-style session entry point that keeps answers hidden until each question is checked.
- **Weak areas:** revisits questions recorded as incorrect without treating unanswered questions as wrong.
- **Bookmarks:** save questions and start a focused practice session from the saved set.
- **Progress:** calculates coverage and accuracy from genuine attempts stored in the current browser.
- **Responsive UI:** desktop sidebar and compact mobile navigation for small screens.
- **Themes:** light/dark theme toggle with system preference used on the first visit and explicit choices persisted locally.
- **Offline-friendly architecture:** the question bank is bundled into the static application; no runtime API is required for answering questions.
- **Optional cloud accounts:** Supabase Auth and an RLS-protected progress row provide private cross-device sync when configured.

## Technology

- React 19 and TypeScript with strict checking
- Vite
- Lucide React icons
- CSS design system with responsive media queries
- Node's built-in test runner
- `pdftohtml` for repeatable source extraction

## Requirements

- Node.js 18 or newer
- npm
- Poppler's `pdftohtml` command for rebuilding the question bank

On Debian/Ubuntu, Poppler is commonly available through the `poppler-utils` package.

## Local Setup

```bash
npm install
npm run import:questions
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite. The importer reads the original `Wildlife Ecology Assignment * Solutions.pdf` files from the project root and writes the browser-ready bank to `src/data/questions.json`.

Useful commands:

```bash
npm run import:questions  # extract and validate the PDF question bank
npm test                 # run question-bank integrity tests
npm run build            # type-check and create dist/
npm run preview          # serve the production build locally
```

## Project Structure

```text
.
├── src/App.tsx                  # application shell and study flows
├── src/styles.css               # responsive design system and themes
├── src/data/questions.json      # generated browser question bank
├── src/lib/supabase.ts         # optional browser-safe Supabase client
├── supabase/migrations/        # Auth-linked progress table and RLS policies
├── scripts/import-question-bank.mjs
├── scripts/question-bank.test.mjs
├── SOURCE-VALIDATION.md
├── public/                      # optional static assets
└── Wildlife Ecology *.pdf       # preserved source papers
```

## Question Source and Verification

The source set contains 12 supplied Wildlife Ecology assignment solution PDFs. The importer uses `pdftohtml -xml` and associates each option with its label. In the normal files, the authoritative answer is the option rendered in bold in the PDF/XML. Week 6's PDF does not expose the bold font metadata consistently, so its ten answers were visually verified against the rendered source page and encoded as an explicit fallback in the importer. The original PDFs remain unchanged.

`SOURCE-VALIDATION.md` is regenerated with the import. The current validated release contains **120 questions: 10 questions for each of Weeks 1–12**, with no missing or ambiguous importer entries. Each record has a stable `w<week>-q<number>` ID, four options, one correct option ID, and a source filename/question reference.

The browser never parses the original PDFs at runtime. The generated bank is public client data; it is not a secure examination answer store.

## Data and Privacy

Without Supabase configuration, attempts, bookmarks, theme selection, and related progress remain in browser `localStorage`. With an account, history, bookmarks, streak metadata, and revision-derived progress sync to that user’s private cloud row. The question bank remains public and static.

### Supabase setup

1. Create a free Supabase project and enable Email Auth. Keep email confirmation enabled for production.
2. In the Supabase SQL Editor, run `supabase/migrations/20261017000000_create_progress.sql`. The migration enables RLS and restricts every operation on `public.progress` to `auth.uid() = user_id`.
3. Copy `.env.example` to `.env.local` and fill in the project URL and browser-safe anon key from Supabase Project Settings > API. Never use a service-role key in Vite or commit `.env.local`.
4. Configure the deployed site URL and redirect URL in Supabase Authentication > URL Configuration. For local development, add `http://localhost:5173` and the Vite URL you use.
5. Run `npm run dev`, register an account, confirm the email if required, and sign in. Existing anonymous local progress is not copied into a new account automatically; this prevents accidental cross-user data disclosure.

The client checks the cloud row before saving and loads a newer remote `updated_at` value instead of overwriting it with stale state. RLS is the authorization boundary; the frontend never supplies a trusted user ID for access decisions. Account sync and isolation require a configured Supabase project and must be tested against that project’s policies.

## Cloudflare Pages Deployment

This is a Vite static site and does not require a server-side API.

1. Create a Cloudflare Pages project connected to the GitHub repository.
2. Set the production branch to the branch you want to publish.
3. Use these build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** 18 or newer
   - **Environment variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if cloud accounts are enabled
4. Save and deploy.

The generated `dist/` directory is ignored by Git because Cloudflare Pages builds it from the repository. Environment variables are optional for local-only mode and required for Supabase accounts.

## Known Limitations

- Explanations are empty because the supplied solution papers provide answer choices and authoritative markers, not verified explanatory prose.
- The current mock-test entry point shares the tested question-session presentation but does not yet implement a timer, review palette, or persisted exam deadline.
- Without Supabase environment variables, progress is local to one browser and is not an account-backed sync service.
- PDF extraction depends on the source layout and should be rerun and reviewed when the source PDFs change.


