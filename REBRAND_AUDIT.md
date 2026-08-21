# REBRAND_AUDIT — Empty Seat → CALENDAIR

The product has exactly one name: **CALENDAIR**. This document records what was found, what was
changed, what was deliberately left alone, and how the result was verified.

## Starting position

Most of the rebrand had already happened before this session: the Empty Seat prototype and its specs
were removed when the project pivoted, so the tree contained no legacy screens, components or copy.
A case-insensitive search for `empty seat`, `emptyseat`, `empty-seat`, `empty_seat` and `EMPTY SEAT`
across the whole repository returned **five** matches, in three files.

## What was changed

| # | Location | Was | Now | Why |
|---|---|---|---|---|
| 1 | `src/lib/onboarding/store.ts` | localStorage key `empty-seat.onboarding.v1` | `calendair.onboarding.v1` | A user-visible artefact of the old brand, written into every visitor's browser |
| 2 | `package-lock.json` (root) | `"name": "empty-seat"` | `"name": "calendair"` | Package metadata disagreed with `package.json`, which already said `calendair` |
| 3 | `package-lock.json` (`packages[""]`) | `"name": "empty-seat"` | `"name": "calendair"` | Same record, second place npm stores it |
| 4 | `src/app/calendair.css` | Comment referring to "the archived prototype at `/legacy`" | Rewritten without the stale reference | The `/legacy` route no longer exists; the comment described a dependency that had been removed |
| 5 | Eight empty directories | `src/components/{booking,landing,market,merchant,mission,trip}/`, `src/lib/{booking,inventory}/` | Removed | Empty Seat's marketplace/merchant structure, left behind with no files in them |

### The localStorage key was migrated, not just renamed

Renaming the key alone would have silently reset onboarding for anyone who had already used the app.
`readStorage()` now reads the new key, and falls back **once** to the old one, copying the value
forward and deleting the legacy entry:

```ts
const KEY = "calendair.onboarding.v1";
const LEGACY_KEY = "empty-seat.onboarding.v1";
```

The new profile store uses `calendair.profile.v1` and has no legacy form, because it is new.

## What was deliberately left alone

- **`AGENT_HANDOFF.md`** still describes the pivot from Empty Seat in its *History* section. This is
  project history, not branding — deleting it would make the repository less honest, not more. It is
  documentation for engineers, not a user-facing surface.
- **The directory name `empty-seat`.** The local folder keeps its name. Nothing reads it, it appears
  nowhere in the product, and renaming a checkout is cosmetic. The brief agrees this is not a blocker.
- **No external identifier was touched.** There are no migrations, deployed resources, third-party
  identifiers or credentials in this repository, so nothing could be broken by a rename.

## Fixed while in the lockfile — a genuine deployment blocker

Auditing `package-lock.json` surfaced something worse than a stale name. The lockfile carried:

```json
"@claude-labs/design-system": "file:../claude-labs-ds"
```

- It is **not** in `package.json`.
- It is imported by **no** source file (verified by search).
- It resolves to a sibling directory that exists on one laptop and on no deployment host.

Three lockfile entries were removed (the dependency record, the `../claude-labs-ds` package entry, and
the `node_modules/@claude-labs/design-system` entry). The file was edited **as JSON** rather than
regenerated, so that removing a stale entry could not quietly bump any other dependency's version.

## Verification

A case-insensitive search of the entire repository for every legacy form:

```
$ grep -rin "empty[ _-]\?seat\|emptyseat" .   # excluding node_modules/.next
AGENT_HANDOFF.md:  the pivot history, retained deliberately
src/lib/onboarding/store.ts:  LEGACY_KEY, retained deliberately for one-way migration
REBRAND_AUDIT.md:  this document
```

**Zero user-facing "Empty Seat" references remain.** The only occurrences are the migration constant
that exists to protect returning users, a paragraph of project history, and this audit.

Also checked and clean:

| Surface | Result |
|---|---|
| `<title>` / metadata / OpenGraph (`src/app/layout.tsx`) | CALENDAIR |
| `public/manifest.webmanifest` | CALENDAIR |
| Icons (`icon.png`, `apple-icon.png`, `icon-192`, `icon-512`, `favicon.ico`) | Current mark |
| Wordmark component, page copy, button labels, alt text, loading states | CALENDAIR |
| `package.json` name | `calendair` |
| `/api/health` `service` field | `calendair` |
| Test fixtures and the demo world | No legacy naming |

`npm run validate`, `npm run test:e2e` and `npm run build` all pass after these changes.
