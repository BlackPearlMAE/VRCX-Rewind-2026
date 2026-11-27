# Development notes

## Structure

- `src/app` and `src/pages`: startup, import, navigation and recap pages.
- `src/data`: fixed SQL, browser worker requests, aggregates and fictional demo data.
- `src/components` and `src/styles`: shared presentation, image permission and audio behavior.
- `src/export`: share-card rendering and PNG/screenshot support.
- `public`: runtime soundtrack, world-thumbnail references and third-party notices.
- `tests/e2e` and `tests/fixtures`: browser checks and synthetic database builders.
- `tests/labs`: isolated timeline/audio controls used by the test fixture, not application preview routes.

The browser tests mount `tests/fixtures/timeline.html` on their development server for isolated component tests. The production app has no preview routes or loading query overrides. The Friends introduction is an intentional recap feature.

## Demo provenance

The demo contains fictional activity and people with `demo-person-*` identifiers, a fixed Demo user profile, 617.3814 hours, 227 active days and 212 sessions. Its snapshot ends November 25, 2026 at 00:00 UTC; November is partial and December unavailable. Some legacy filenames and type labels retain recorded/demo terminology; the public demo activity is fictional.

World names and world IDs identify real worlds for the existing opt-in thumbnail lookup; they do not describe a person's activity. No owner/friend avatar or boop artwork is embedded in the demo. Synthetic aggregate support data lets exclusions recalculate totals and refill rankings.

## Thumbnail lookup

`public/data/world-thumbnails.bin` is a static VWI1 lookup: an eight-byte header followed by 36-byte rows containing a world UUID, image-file UUID and uint32 image version. It stores no user IDs, names, visits, timestamps or credentials. The browser reconstructs image URLs and loads pictures only after permission.

The optional Python maintainer tools under `scripts` build/maintain this catalog. They are not invoked by the website or deployment workflow. Their local outputs belong in ignored `private/`; do not commit databases, cookies, raw account responses or collection caches. Optional maintainer authentication is interactive and remains separate from website visitors.

## Reproducibility

Use `npm ci` with the checked-in lockfile. The project build performs TypeScript checking before bundling. Required fonts, music, WASM and lookup data are local static assets. No image proxy, production backend or VRChat account login is supplied by the site.
