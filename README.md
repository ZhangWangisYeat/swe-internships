# SWE Internship Tracker Version 1.0

I got tired of applying to internships that had already closed, so I built a list that checks. It
pulls software engineering internships from the community list, checks every posting against the
company's own job board, throws out the ones that are closed, and splits what's left into three
pages by degree level:

| Page | Level | Roles |
| --- | --- | --- |
| `/` | Undergrad (Bachelor's / Associate's) | ~1,050 |
| `/masters/` | Master's / MBA | ~380 |
| `/phd/` | PhD | ~100 |

The levels **overlap on purpose**. A role listing `["Bachelor's","Master's"]` really does take both,
so it shows up on both pages. All three pages read the same `data/jobs.json` and filter it on a
`levels` array, which means the tab counts always agree with each other and switching pages doesn't
cost another download.

Each row has **Company · Role Name · Location · Date Opened · Apply**, plus the resume keywords for
that role, a save/applied tracker, and a "new since your last visit" badge.

## How it works

```
GitHub Action (every 6h)                      Static site (no server)
┌──────────────────────────────┐              ┌────────────────────────────┐
│ 1. fetch upstream listings   │              │ reads data/jobs.json        │
│ 2. filter: degree level +    │   commits    │ revalidates on load, focus, │
│    Software + current cycle  │ ──────────▶  │ and every 30 min            │
│ 3. verify each posting is    │ data/*.json  │ tracker + theme in          │
│    still open (tiered)       │              │ localStorage                │
│ 4. sanity-guard, then write  │              └────────────────────────────┘
└──────────────────────────────┘
```

All the network stuff happens in the Action, so your browser never has to talk to a job board. The
site itself is completely static: no database, no server, no secrets.

**Source:** the [SimplifyJobs / Pitt CSC](https://github.com/SimplifyJobs/Summer2027-Internships)
`listings.json`, which I then re-verify on my own. That repo rolls over every year (`Summer2027` →
`Summer2028`), and `resolveSourceRepo()` checks for the newest one first, so the switch doesn't need
a code change.

### Filtering

| Stage | Rule |
| --- | --- |
| Active | upstream `active` **and** `is_visible` |
| Degree level | map `degrees` → pages: `Bachelor's`/`Associate's` → undergrad, `Master's`/`MBA` → masters, `PhD` → phd. A row can match several. Maps to none (a `JD`-only role) → drop. Empty `degrees` → title heuristic, kept as `inferred` |
| Software | `category` ∈ {`Software`, `Software Engineering`} |
| Current cycle | any term whose nominal season start is ≥ 45 days ago; bare `N/A` terms kept only while < 90 days old |

The level mapping is the easiest thing in here to get wrong, and you can get it wrong in *either*
direction. `["Bachelor's","Master's"]` belongs on both pages. If you treated any mention of Master's
as "not for undergrads", you'd throw away a huge chunk of real roles, because most listings that
mention a Master's put Bachelor's right next to it.

### Closure verification

Each posting gets sent to a checker based on its URL host, and I batch them per board wherever I can.

| Tier | Adapters | Signal |
| --- | --- | --- |
| T1 | Greenhouse, Ashby, Lever, SmartRecruiters | one request per board; absence from the live list, `isListed:false`, or a past `application_deadline` ⇒ closed |
| T2 | Workday | CXS JSON `posted` / `canApply` booleans |
| T3 | generic fallback | final-URL redirect check + specific closure phrases |

Two things this gets right that a simple checker wouldn't:

- **Status codes lie.** A closed Greenhouse posting still returns **HTTP 200**, it just quietly
  redirects you to the company's job board. So the check compares the *final* URL against the
  posting's ID instead of trusting the status code.
- **One bad check never deletes a row.** A role has to come back closed on **two runs in a row**
  before it gets removed (`STRIKES_TO_CLOSE`). Timeouts, 429s, 403s and 5xx errors all count as
  `unverified`, never `closed`. Anything I can't confirm stays on the list with an *Unverified*
  badge, because hiding a real opening is a lot worse than showing a stale one.

`Date Opened` uses the company's own publish date when there is one (Greenhouse `first_published`,
Ashby `publishedAt`, Workday `startDate`). Otherwise it falls back to the date on the list and gets
marked `·approx`.

### Resume keywords

Every role comes with the skills a resume screen is probably looking for: up to 9 technical and 3
soft, ranked, with a copy button on each row. Search matches them too, so searching "kubernetes"
finds every role that wants it even if it's not in the title.

These come from matching a hand-picked dictionary of ~250 skills (`pipeline/src/keywords/`), **not**
from an LLM. Resume screening basically *is* keyword matching against a known list of words, so the
same approach makes sense here. It's free, it gives the same answer every time, it's easy to test,
the Action doesn't need an API key, and it can't make up a skill the posting never mentioned (which
is probably the worst thing that could happen to text you're pasting onto your resume).

The descriptions come from requests the verification step is **already making**, so the keywords
barely cost any extra traffic. Workday's `jobDescription`, Ashby's `descriptionPlain` and Lever's
description fields are already in those responses, the generic checker already has the page HTML,
and Greenhouse just needs `?content=true` added to the board request it's already making. That
covers about 75% of roles. The rest are career sites that build the page with JavaScript (so
there's nothing in the HTML to read) and SmartRecruiters, whose list endpoint doesn't include
descriptions.

My rule is that a **wrong** keyword is worse than a missing one, so any word that means more than
one thing gets its own hand-written pattern instead of a plain word match. These are real false
positives it caught:

| Term | Was matching | Now requires |
| --- | --- | --- |
| `Spring` | "Spring 2027", the season, which is in basically every posting. Tagged 56 roles that had no Java at all | Spring Boot/Framework/MVC/…, or Java adjacent |
| `Security` | "social security number", "security clearance", "national security" | a technical qualifier (application/cloud/… security, security engineering) |
| `Networking` | "networking **opportunities**", "networking events" | protocols, TCP/IP, network programming |
| `Express` | "express written consent", "American Express" | the `.js` suffix, or Node adjacent |
| `C`, `Go`, `R` | "vitamin C", "go to", stray capitals | a language list (`C/C++`, "Go, Python") or "C programming" |
| `Mentorship` | "you'll be paired with a mentor", which is something they give you, not a skill you bring | mentoring others |

Two-letter aliases (`JS`, `TS`, `ML`, `RL`) only match in capitals, so "ml" in normal text doesn't
count. Three-letter names like `SQL` and `Git` are distinctive enough that they don't need that.
`CV` is intentionally *not* treated as Computer Vision, because on a job posting it usually means a
resume.

Keywords are cached in `state.json` so runs that use the cache still have them, and that cache is
**versioned** (`DICTIONARY_VERSION`). Without the version, a keyword that got extracted wrong would
stay wrong forever, which is exactly what happened when roles kept their `Spring` tag even after I
fixed the pattern. Bump the version any time you change the dictionary or the scoring.

### Guardrails

- **zod** validates the upstream data, so if their format ever changes the run fails loudly
  instead of quietly putting out a badly filtered list.
- **Drop guard**: if the number of open roles falls by more than 40% from one run to the next,
  nothing gets written and the job fails, so the last good data stays up. Set `ALLOW_LARGE_DROP=1`
  if the drop is actually real.
- Writes are atomic (temp file + rename) and only happen once the whole pipeline has succeeded.
- `http://` apply links get upgraded to `https://`, since these are forms where people upload their
  resumes.

## Usage

```bash
npm install

npm run refresh          # fetch + verify + write data/   (~90s for ~1,100 roles)
npm run refresh:fast     # skip verification (upstream flags only)
npm run refresh:force    # re-verify everything, ignoring the 12h cache

npm run dev              # http://localhost:3000
npm run build            # static export to web/out/
npm test                 # 148 tests
npm run typecheck
```

Run `npm run refresh` at least once before `dev` or `build`. Otherwise there's no data yet, and the
site will show an empty page telling you to do that.

A couple of handy flags: `--limit=N` (only look at N rows, which also skips the drop guard) and
`--cache` (reuse the downloaded list for up to an hour, which is way faster when you're iterating).

## Layout

```
pipeline/src/
  sources/simplify.ts    fetch, repo-rot resolver, zod validation
  filter.ts              degree level / category / cycle rules
  verify/                adapter per ATS + dispatcher + two-strike logic
  keywords/              skill dictionary + resume keyword extraction
  transform.ts           raw listing -> public Job, dates, URL normalization
  emit.ts                drop guard + atomic write
data/
  jobs.json              the artifact the site reads
  meta.json              staged counts, tier coverage, per-adapter stats, diff
  state.json             firstSeenAt + strike counters (persisted across runs)
web/
  app/page.tsx            undergrad page (the root)
  app/masters/page.tsx    master's page
  app/phd/page.tsx        PhD page
  components/, lib/       all shared; LevelPage wraps Dashboard with a `level` prop
  lib/levels.ts           per-level labels, headings and routes
  lib/seo.ts              page titles, descriptions, canonical links
```

`data/` is committed on purpose. It's what actually gets deployed, and its git history doubles as a
record of when every role opened and closed.

## Deploying

The site runs on **Cloudflare** (free tier) as a Worker that only serves static files, hooked up to
this repo through Cloudflare's GitHub app. `wrangler.jsonc` at the root points it at `web/out`. That
file has to be there, because the root is an npm workspace and Cloudflare's auto-detection just gives
up on those.

## Caveats

- The upstream list is community-maintained and not perfect. The independent verification is what
  catches its stale rows (when I measured it, ~2% of the rows it called "active" were already
  closed).
- `unverified` rows are usually sites that block automated requests (Workday sites behind bot
  protection, custom career portals). I show them on purpose.
- Roles where the list has no degree info are kept based on the job title and get a *Degree?*
  badge. PLEASE check the posting before assuming undergrads can apply.
- Keywords are only as good as the dictionary. If it doesn't know a skill, that skill won't show
  up, so read the actual posting before assuming the list is complete, and only put things on your
  resume you can actually back up in an interview.
- Verification only makes read-only GET requests to public pages. They're rate-limited and
  identify themselves with a User-Agent.

## Notes
 - Version 1.1 will likely be dynamic, with a login in to store your flagged applications, along
   with a way to possibly automatically update your resume or cover letter with any keywords using AI
   additions. 
 - I definitely wrote too much 
