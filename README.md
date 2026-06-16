# My Team Tracker ⚾

A personal MLB team tracker by Jay Nargundkar. Quick daily check-in on your team:
record + L10, last three games (with notable performances), upcoming/in-progress
games, plus season and last-30-day leaders for hitters and pitchers.

Pulls live data from the MLB Stats API (`statsapi.mlb.com`) — free, no auth, no key.
No backend, no database, no API costs.

## Local development

Requires Node 18+.

```bash
npm install
npm run dev
```

Visit http://localhost:5173

## Build and preview production bundle

```bash
npm run build
npm run preview
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com), click "Add New Project," and import the GitHub repo.
3. Vercel auto-detects Vite. Click Deploy.

You'll get a URL like `team-tracker-<hash>.vercel.app`. Custom domains are free on the Hobby tier.

## Configuration

All the knobs live near the top of `src/App.jsx`:

- `DEFAULT_TEAM_ID`: which team loads on launch (currently `120` = Nationals).
- `SEASON`: which season to query (currently `2026`). Bump this each spring.
- `CACHE_TTL_MS`: how long to cache fetched data in `localStorage` (currently 5 minutes).
- `TEAMS`: the team list and brand colors used for the dropdown and team name treatment.

## Caching

Each team's data is cached per-team in `localStorage` for 5 minutes. Switching teams
hits the cache when warm — no refetch. Drawback: during a live game, the in-progress
score can be up to 5 minutes stale.
