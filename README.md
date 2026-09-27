# Wortwerk

A private, phone-first German vocabulary tracker. It keeps new words, meanings, noun articles and plurals, memory tricks, examples, review difficulty, and progress in a Google Sheet through Google Apps Script. The site runs as a Cloudflare Worker; passwords and the Sheet API token stay on the server.

The visual language follows the Job Application Tracker in the neighboring repo. The vocabulary fields follow the user's two-page *Vocab Tricks* class note, used as source material: E (English link), T (trick), S (story), article/word/meaning/plural, and the listed plural patterns. The note's advice is reflected in the form; it is not treated as an instruction to this software project.

## What it does

- Quickly add nouns, verbs, and other words, with search and filters.
- For nouns, store article, plural, plural pattern, and an E/T/S memory route. Story groups connect related words.
- Practice due flashcards and rate each recall **Hard**, **Medium**, or **Easy**. Hard returns in 10 minutes; Medium in 1–7 days; Easy in 4–21 days. Four consecutive successful recalls ending with Easy mark a word **Proficient** and remove it from the due queue. A Hard rating resets that streak. Difficulty, streak, due date, and review count are stored in Sheets.
- Review the learning map for article balance, memory routes, difficulty, and story groups.
- Install the site to your Samsung home screen from the browser menu for an app-like shortcut. Internet access is required to read and write the Sheet.

## Connect Google Sheets

1. Create a new Google Sheet. Open **Extensions → Apps Script**.
2. Replace `Code.gs` with [google-apps-script/Code.gs](google-apps-script/Code.gs). Run `setup()` once and grant the requested Sheets access. It creates the `Vocabulary` tab and headers.
3. Generate a random API token with `openssl rand -hex 32`. In Apps Script, open **Project Settings → Script Properties**, add a property named `API_TOKEN`, and paste the generated token as its value. The included `setApiToken(token)` helper is available if you prefer to call it from another Apps Script function.
4. Deploy → **New deployment** → **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Copy the `/exec` URL. The URL is public, but the Apps Script rejects requests without the token. Keep both token and deployment URL private.
5. After any edit to `Code.gs`, deploy a **new version** of the existing web app. The URL usually stays the same.

## Cloudflare secrets

Add these four secrets to the Worker. Do not add them to `wrangler.jsonc` or the frontend:

```bash
npx wrangler secret put PORTAL_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put APPS_SCRIPT_URL
npx wrangler secret put APPS_SCRIPT_TOKEN
```

- `PORTAL_PASSWORD`: the fixed password you will enter on the site.
- `SESSION_SECRET`: a separate random value, e.g. `openssl rand -hex 32`, used to sign 12-hour HttpOnly session cookies.
- `APPS_SCRIPT_URL`: the deployed Google Apps Script `/exec` URL.
- `APPS_SCRIPT_TOKEN`: the same token saved through `setApiToken()`.

Cloudflare's secret commands are meant to run after the Worker exists. You can first deploy with `npm run deploy`, add the secrets, and visit the site after all four are set. The API stays unavailable until setup is complete.

## Local run

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your local password, session secret, Apps Script URL, and token.
npm run dev
```

`npm run dev` builds and serves the complete Worker at `http://localhost:8787`. Run it again after source changes. `npm run dev:ui` starts Vite for visual frontend editing, but its API requires the Worker server. `npm run build` checks TypeScript and builds static assets. `npm run deploy` builds and deploys to Cloudflare.

The Apps Script tab is the source of truth. The Worker never embeds its URL, API token, or portal password in the browser bundle. A valid password creates an HttpOnly, SameSite cookie; write requests also check the request origin. Delete is permanent in this first version, so the interface asks for confirmation.
