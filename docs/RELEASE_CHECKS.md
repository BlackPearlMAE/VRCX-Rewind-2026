# Release checks

## Current release scope

The information-page wording, loading/error messages and supported VRCX migration were accepted before preparing this release. Desktop is the target; mobile layout changes and unusually long name handling are not blockers for this release.

The project owner's code remains unlicensed, with reuse requests handled directly by the owner. No MIT/GPL/custom reuse grant is supplied. Third-party terms remain separate.

## Before pushing

- Review the exact commit file list. Exclude databases, private/local snapshots, environment files, development research, caches and generated build/test output.
- Preserve the repository's existing initial commit and publish the reviewed application as its successor. Separate local development history is not part of this release.
- Install locked dependencies and validate the exact release source, including fictional demo navigation, imports, account switching, exclusions and share-card export.
- [x] Keep runtime third-party notices and the exact source-upload attribution terms. The three YouTube descriptions, their CC 3.0 links, supplied credits and audio-change notices are recorded in THIRD_PARTY_NOTICES.md and public/audio/CREDITS.txt. HOME adaptations retain its ShareAlike terms; the code remains separately unlicensed.

## After upload and deployment

The manual Pages workflow runs on main and deploys `dist/`. Confirm repository visibility/account plan supports Pages, select GitHub Actions as the Pages source and run Deploy GitHub Pages manually.

Validate the actual hosted origin:

- Asset loading under the project URL, Start interaction and audio unlocking, mute/volume, navigation, background-tab behavior and playlist rotation.
- Offline import, account switching, navigation and PNG export after required assets have loaded, including reconnection behavior.
- No unexpected requests with images disabled and no persisted imported data. Image opt-in, image hosts, expired links and cache reuse when enabled.
- Deployed CSP, the deployed source revision and the privacy notice's description of the actual hosted behavior.

These hosted checks are not marked complete by local browser tests. Upload and publication require their own explicit task.
