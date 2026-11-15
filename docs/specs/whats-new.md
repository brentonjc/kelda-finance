# Spec: What's new

**Status:** Draft for review · **Author:** Brenton (with Claude) · **Date:** 2026-10-25
**Target:** branch from `main` (v2.10.0). Ships as a MINOR release.

---

## 1. Problem

Release notes live only in Settings › About › Version history, under "Quote this version number when reporting an issue". They read as a support log, not news. People who use Kelda don't find out about features that would help them. The Tax beta, card and loan balance sync and Amex import all shipped with no in-app announcement.

The groundwork is already there:

- `APP_CHANGELOG` in `js/version.js` is a structured, newest-first list with plain-language notes.
- `isFreshUpgrade()` was meant to drive a "what's new" banner. It can never return `true`, because `recordCurrentVersion()` stamps the new version as soon as the script loads, before anything can check it.

## 2. Goals

1. A user learns about a meaningful release the first time they open Kelda after it ships, without being blocked.
2. They can find past releases later from the places they already look: More, the sidebar, the bell, and the welcome screen.
3. Every note leads with what the user can now do, not what the code changed.
4. One source (`APP_CHANGELOG`) feeds every surface, including the beta site's `release-notes.json`.

**Non-goals:** push or email notifications, analytics on who read what (no data leaves the device), and screenshots or illustrations in v1.

## 3. Decisions (agreed 2026-10-25)

| # | Decision |
|---|----------|
| D1 | First touch is a **dismissible card at the top of the Dashboard**, never a blocking modal. |
| D2 | Only **highlighted** releases show the card. By default these are MINOR and MAJOR bumps. An entry can override this with `highlight: true/false` (see §5.2). |
| D3 | The permanent **What's new** page is reachable from the **More menu, the sidebar, the bell, and the welcome screen**. |
| D4 | Copy is **headline + 2–3 benefit bullets + optional "Try it" deep link**. Claude drafts it, and Brenton approves it in each release PR. |
| D5 | "Seen" state is **per profile**: Brenton, Shelley and Joint each see the card once. |
| D6 | **Fresh installs see no card.** The page is still there to browse. |
| D7 | The nav item a release links to gets a **"New" badge** until that profile visits the page, or for 30 days after the release date, whichever comes first. |
| D8 | `APP_CHANGELOG` is the **single source**. The beta site's `release-notes.json` is generated from it. |

## 4. User experience

### 4.1 Dashboard card

Shown at the top of the Dashboard content, above the hero card, when the active profile has unseen highlighted releases.

```
┌─────────────────────────────────────────────┐
│ ✦ New in v2.10.0                          ✕ │
│ Goal finish dates now follow your real pace │
│ • Once you add money to a goal, its finish   │
│   date is based on that goal's own pace      │
│ • Link a goal to any of your accounts        │
│ • Deleting an account keeps its goals        │
│                                             │
│ [ Open Goals ]          See all updates →   │
│ + 2 more updates since you last looked      │
└─────────────────────────────────────────────┘
```

- **Content:** the newest unseen highlighted release. If more than one unseen release exists (highlighted or not), the card adds a line, "+ N more updates since you last looked", which opens the What's new page.
- **Timing:** after the post-unlock welcome/data-health screen (`kl-screen-welcome`) has closed and the Dashboard has rendered. Never on top of the PIN pad or the welcome screen.
- **Marked as seen** when the user taps ✕, **Try it** or **See all updates**. Navigating away without doing any of these leaves the card in place for next time.
- **Expires after 14 days.** If nobody acts on it, the card stops showing 14 days after it first appeared for that profile. The release stays unread in the bell, the nav dot and the What's new page until the page is opened.
- **Seen means everything up to the current version.** Older unseen releases don't queue up as more cards.
- **Beta features:** if a release's `requires` beta flag is off, **Try it** opens Settings › Beta features with a label such as "Turn on Tax (Beta)", not the hidden page.
- No entrance animation beyond the app's standard card fade. Respects `prefers-reduced-motion`.

### 4.2 What's new page

- New page id `whatsnew` in a new file, `js/pages/whatsnew.js`, titled "What's new".
- Releases are listed newest first.
  - Each **highlighted release** shows its version, date, headline, benefit bullets and **Try it** button.
  - **Non-highlighted releases** in a row are collapsed into one row, "Fixes and improvements · v2.5.9–v2.5.12", which expands to show their headlines.
- Releases this profile hadn't seen when they opened the page get a small "New" dot. Opening the page marks everything as seen.
- A footer link reads "Full technical history in Settings › About".
- On desktop it's a single readable column (max ~680px), not a full-width table.

### 4.3 Entry points

| Surface | Entry | Unread indicator |
|---|---|---|
| Sidebar (desktop/iPad) | "What's new" item near the bottom, above Settings | Dot when there are unseen highlighted releases |
| More menu (mobile) | "What's new" tile in a top "Kelda" section | Same dot |
| Bell (`openNotifModal`) | A "What's new in vX.Y" row at the top of the modal when unseen. Afterwards it lives in a "See all updates" link. | Unseen highlighted releases count towards `updateNotifDot()` |
| Welcome screen (pre-login) | The version label becomes a link, "v2.10.0 · What's new" | None. No profile is known yet. |

The welcome-screen link opens the What's new list as a read-only sheet. Release notes contain no personal data, so showing them before unlock is safe. Opening it **does not** mark anything as seen, because no profile is active.

Settings › About keeps the existing detailed history (`notes`) and adds a link: "See what's new".

### 4.4 "New" badges in the nav

- When a highlighted release has a `link.page`, that page's nav item shows a small "New" pill: in the sidebar `nav-item`, the More menu tile and, for tab-bar pages, the tab.
- If the page sits inside a sidebar flyout (`nav-cat`), the category row shows the pill too.
- The pill clears per profile when that page is visited via `go()`, or 30 days after the release `date`, whichever comes first.
- At most 3 badges show at once (newest releases win), so the nav never looks like a Christmas tree.

## 5. Data

### 5.1 Changelog entry shape

Existing fields are kept, so Settings › About keeps working unchanged.

```js
{
  version: '2.10.0',
  date: '2026-10-25',
  title: 'Goals keep a history',          // existing: short internal label, Settings history
  headline: 'Goal finish dates now follow your real pace', // NEW: benefit, ≤ 70 chars
  benefits: [                             // NEW: 2–3 user-facing bullets, ≤ 110 chars each
    'Once you add money to a goal, its finish date is based on that goal’s own pace',
    'Link a goal to any of your accounts, not only the first four',
  ],
  link: { page: 'goals', label: 'Open Goals' }, // NEW, optional: Try it target + badge
  requires: 'tax',                        // NEW, optional: beta flag the link depends on
  highlight: true,                        // NEW, optional: overrides the version rule
  notes: [ ... ],                         // existing: detailed, Settings only
}
```

Imports link to the `upload` page, which is the CSV import flow on both phone and desktop, so `link` needs no extra action field. Entries never contain function names or code.

Entries with no `headline` fall back to `title`, and entries with no `benefits` fall back to the first 3 `notes`. Old entries render without being rewritten.

### 5.2 Highlight rule

```
isHighlighted(entry) =
  entry.highlight is boolean ? entry.highlight
                             : patch(entry.version) === 0   // X.Y.0
```

The override matters in practice. v2.5.8 (Amex import) and v2.5.13 (balances from your bank file) were features shipped as patch bumps, so the version rule alone would have kept them quiet.

### 5.3 Per-profile state

A new storage key, `K.whatsnew = 'cff_whatsnew'`:

```js
{
  brenton: { start: '2.9.1', seen: '2.10.0',  cardShown: {},                         visited: { goals: '2.10.0' } },
  shelley: { start: '2.9.1', seen: '2.9.1',  cardShown: { '2.10.0': '2026-10-26' }, visited: {} },
  joint:   { start: '2.9.1', seen: '2.10.0',  cardShown: {},                         visited: {} }
}
```

- Joint has its own record and is treated like a third profile, even though it has no PIN.
- `start` is the version the record was created at. Releases up to it never get a nav badge, so a fresh install shows none.
- `seen` is the highest version whose card or list this profile has acknowledged.
- `cardShown[version]` is the date the card first appeared for that release. It drives the 14-day expiry.
- `visited[page]` is the version whose badge for `page` this profile has already cleared.
- Add `cff_whatsnew` to Full Backup (it's profile state). Keep `cff_app_version` in `BACKUP_SKIP`.

### 5.4 Initialising "seen" (fresh install vs upgrade)

1. In `version.js`, read the previous `cff_app_version` into `PREV_RUN_VERSION` **before** `recordCurrentVersion()` stamps the new one. Fix `isFreshUpgrade()` to compare against `PREV_RUN_VERSION`.
2. The first time `cff_whatsnew` is missing, create a record for **every profile in use**: brenton, plus shelley and joint when a second person is set up (`hasSecondUser()`, since v2.10.3). Set `seen` to:
   - `PREV_RUN_VERSION` if it exists. This is an existing user who just upgraded, and they'll see what's new since then.
   - otherwise `APP_VERSION`. This is a fresh install (D6), so there's no card.
3. Profiles in use are initialised together so that Shelley, unlocking a week later, still gets the card even though the device-level version has moved on.
4. A profile that appears later (a second person is turned on) starts at the current `APP_VERSION`, so they don't inherit a backlog of updates from before they joined.

### 5.5 Pure logic (unit-testable)

Put these in `js/whatsnew-core.js`, a classic script with globals so it can be loaded with `node:vm` in tests:

- `compareVersions(a, b)` handles numeric segments, so `2.10.0 > 2.9.1`.
- `isHighlighted(entry)`
- `unseenReleases(log, seenVersion)` returns entries newer than `seen`, newest first.
- `cardRelease(log, profileState, today)` returns the newest unseen highlighted entry, or `null` if there isn't one or its card first showed 14 or more days ago.
- `activeBadges(log, profileState, today)` returns at most 3 page ids, applying the 30-day expiry and `visited`.
- `initialSeen(prevRunVersion, appVersion)`
- `groupForList(log)` collapses runs of non-highlighted entries.

## 6. Writing guide (applies to `headline` and `benefits`)

- Start with what the user can now do or no longer has to worry about: "Import your Amex statements", not "Added Amex CSV parser".
- Use second person, sentence case and Australian spelling. No "we", no exclamation marks, no emoji in the copy.
- Use one idea per bullet and real nouns (Bunnings, PAYG, offset), not internal names (`liab:<id>`, `cff_*`).
- Don't use people's names. The app ships to beta testers: say "everyone in your household", not "Brenton and Shelley".
- Beta features say "(Beta)" in the headline and keep the "estimates only" caveat where it applies.
- Bug fixes say what now works, not what was broken, unless the user would have noticed the bug.
- Limits: headline ≤ 70 characters, bullets ≤ 110 characters, at most 3 bullets.

## 7. Release process changes

- Update the header comment in `version.js`. Every entry needs `headline` and `benefits`. Set `highlight: true` when a patch release adds something a user would want to know about, and `false` for a MINOR release that's purely internal.
- The `/ship` checklist (or PR template) gets the line "What's new copy reviewed: headline, benefits, highlight, link".
- Add `tools/build-release-notes.mjs`, a Node script with no dependencies. It loads `js/version.js` with `node:vm` and writes `release-notes.json` for the beta site, using only `version`, `date`, `headline`, `benefits` and `highlight`. It's run by hand when building the beta site.
- Bump the `sw.js` cache name so the new page and script are precached for offline use.

## 8. Acceptance criteria

**Auto** = covered by `tests/whatsnew.test.js`. **Manual** = Brenton checks on the Netlify deploy preview (iPhone Home Screen app + desktop).

### Card
| # | Criterion | Check |
|---|---|---|
| AC1 | Given Brenton last ran v2.9.1, when v2.10.0 loads and he unlocks, then the Dashboard shows the v2.10.0 card after the welcome/data-health screen closes. | Manual |
| AC2 | The card never appears over the PIN pad, the welcome splash or the data-health screen. | Manual |
| AC3 | Tapping ✕, Try it or See all updates marks the release as seen for that profile only. Reloading doesn't show it again. | Manual + Auto (state update) |
| AC4 | Given Brenton has dismissed the card, when Shelley unlocks, then Shelley still sees it. The same applies to Joint. | Manual |
| AC5 | A fresh install (no `cff_app_version`) shows no card for any profile. | Auto (`initialSeen`) + Manual |
| AC6 | An upgrade that only contains patch releases with no `highlight: true` shows no card and adds no bell count. | Auto |
| AC7 | A patch release with `highlight: true` does show the card. | Auto |
| AC8 | When 3 releases are unseen, the card shows the newest highlighted one plus "+ 2 more updates", and dismissing it marks all 3 as seen. | Auto + Manual |
| AC9 | Try it on a release whose `requires` beta flag is off opens Settings › Beta features, not a hidden page. | Manual |
| AC10 | Shelley, first unlocking a week after the upgrade, still gets the card. | Auto (all profiles initialised together) |
| AC10a | A card nobody acts on stops showing 14 days after it first appeared for that profile, and the release stays unread in the bell and the list. | Auto (`cardRelease`) |
| AC10b | Try it on v2.9.0 and v2.5.8 opens the Upload page (CSV import), on phone and desktop. | Manual |

### What's new page and entry points
| # | Criterion | Check |
|---|---|---|
| AC11 | The page is reachable from the sidebar, the More menu, the bell modal and the welcome screen version link. | Manual |
| AC12 | Runs of non-highlighted releases collapse into one "Fixes and improvements" row that expands. | Auto (`groupForList`) + Manual |
| AC13 | Opening the page from a signed-in profile clears the unread dot in the sidebar, More menu and bell. | Manual |
| AC14 | Opening it from the welcome screen (signed out) marks nothing as seen. | Manual |
| AC15 | Entries with no `headline` or `benefits` render from `title` and `notes`. | Auto |
| AC16 | Settings › About still shows the full detailed history and links to What's new. | Manual |

### Badges
| # | Criterion | Check |
|---|---|---|
| AC17 | After v2.10.0, Goals shows a "New" pill in the sidebar and the More menu until Goals is opened. | Manual |
| AC18 | The pill clears 30 days after the release date even if the page was never visited. | Auto |
| AC19 | No more than 3 pills show at once. | Auto |
| AC20 | Pages inside a sidebar flyout also badge their category row. | Manual |

### Quality bar
| # | Criterion | Check |
|---|---|---|
| AC21 | `compareVersions` orders `2.10.0` above `2.9.1`. | Auto |
| AC22 | All controls are ≥ 44×44px. The card has `role="region"` and an `aria-label`, and ✕ has `aria-label="Dismiss what's new"`. | Manual |
| AC23 | Colours use only tokens, with no new inline `style=""`. It reads correctly in all themes, light and dark. | Manual |
| AC24 | It works offline after first load, with the new files precached. | Manual |
| AC25 | `node tools/build-release-notes.mjs` writes valid JSON matching the changelog. | Auto |
| AC26 | Lint (`node .claude/check-syntax.mjs`) and tests pass. | Auto |

## 9. Resolved questions (2026-10-25)

1. **Joint** has its own seen state and is treated like a third profile (§5.3).
2. **Goals contribution history (v2.10.0)** isn't visible to users yet, so the copy doesn't promise it. When the one-tap contributions release ships, its entry gets a "see every dollar you've added" benefit.
3. **Import deep link:** "Import a file" opens the Upload page, which is the CSV import flow (§5.1).
4. **Card lifetime:** the card expires 14 days after it first appears for that profile (§4.1).

---

## Appendix A: Draft benefit-led copy (v2.5.8 → v2.10.0)

`H` = shows the card. A ★ marks a recommended `highlight` override against the version rule.

### v2.10.0 · H
**Goal finish dates now follow your real pace**
- Once you add money to a goal, its finish date is based on that goal's own pace
- Link a goal to any of your accounts, not only the first four
- Deleting an account no longer touches its goals. They keep their amounts and just stop syncing

`link: { page: 'goals', label: 'Open Goals' }`

### v2.9.1 · list only
**Goal dates you can trust**
- Finish dates use what you've actually saved over the last 3 months, not a guessed $500 a month
- Your Dashboard and Goals page now show the same finish date
- Deleted a goal by mistake? You have 5 seconds to undo it

### v2.9.0 · H
**Import a card or loan statement and its balance fills itself in**
- Pick a credit card, BNPL, loan or mortgage when you import a bank file with a running balance
- Kelda fills in that debt's monthly balances and current balance for you
- Choose "balances only" so repayments already in your bank account aren't counted twice

`link: { page: 'upload', label: 'Import a file' }`

### v2.8.0 · H · requires `tax`
**Tax (Beta): know what to set aside when your shares vest**
- Record each RSU vest and see the tax to put aside on it, and on the next one coming up
- Shares sold within 30 days of vesting are handled correctly, even when that moves the income into the next financial year
- Estimated tax owed now comes off your net worth and borrowing power, labelled as an estimate. You can turn this off

`link: { page: 'tax', label: 'Open Tax (Beta)' }`

### v2.7.0 · H · requires `tax`
**Tax (Beta): see your return take shape before you lodge**
- A worksheet laid out by ATO label, showing where every figure came from
- Interest, capital gains and tagged deductions fill in from what's already in Kelda
- See an estimate of what you'll pay or get back, and export a pack for your tax agent

`link: { page: 'tax', label: 'Open Tax (Beta)' }`

### v2.6.0 · H
**Tax (Beta): PAYG instalments and ATO due dates in one place**
- See your ATO due dates based on how you lodge, whether yourself or through a tax agent
- Track each PAYG instalment, when it's due and what you've paid
- Turn it on in Settings › Beta features. Estimates only, not tax advice

`link: { page: 'settings', label: 'Turn on Tax (Beta)' }`

### v2.5.13 · H ★
**Your account balances can now fill themselves in**
- When your bank file includes a running balance, Kelda fills in that account's monthly balances
- A check before import shows anything that doesn't add up, and nothing changes until you've reviewed it
- Everyone in your household now sees the same net worth

`link: { page: 'cash', label: 'Open Bank Accounts' }`

### v2.5.12 · list only
**Checkboxes that look like checkboxes**
- Checkboxes and options use your device's own style, in your theme colour
- On phones you can tap the label next to a checkbox, not just the box

### v2.5.11 · list only
**Easier to read in every theme**
- Status badges, buttons and green/amber/red amounts have stronger contrast in every theme

### v2.5.10 · list only
**More of your transactions get the right category on their own**
- "Purchase at…" and "Online purchase from…" are matched on the shop's name
- A rule you set for Bunnings now covers every Bunnings store
- Fewer odd matches: "Shelley" is no longer Shell petrol, and Uber Eats is food delivery, not a taxi

### v2.5.9 · list only
**Card statements with positive spending import correctly**
- New "Positive amounts are spending" option for statements that list purchases as positive

### v2.5.8 · H ★
**Import your American Express statements**
- Amex CSV files now import, with purchases as spending and repayments filed as transfers
- Addresses that run over several lines no longer break a transaction into pieces

`link: { page: 'upload', label: 'Import a file' }`
