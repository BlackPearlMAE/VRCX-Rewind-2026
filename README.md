# VRCX Rewind 2026

Your year in VRChat, revisited. A browser-based recap of your VRCX history, with local data processing and shareable highlights.

Select a compatible VRCX database, choose an account when needed, and explore your recorded time, personal records, Worlds and Friends. A fictional demo is available without importing a database. Share cards can be saved as PNGs or, where remote artwork prevents export, using the provided screenshot view.

## Data and privacy

- Database validation and recap calculations run locally in a browser worker. The app does not upload imported databases or retain imported data in browser storage.
- Required application assets, including the SQLite engine and soundtrack, load before entry. After loading, import, navigation and PNG export can work offline with remote pictures disabled.
- VRChat pictures are optional and off by default. Enabling them makes direct requests to VRChat image hosts. Those hosts receive ordinary request information, including the requested URL and IP address; browser cookie policy applies.
- Volume and mute preferences are the only app settings saved in localStorage. They expire 30 days after the last change.
- Global VRCX activity history is shared between accounts. Account-specific data is used where the database supports it. See [database compatibility](docs/DATABASE_COMPATIBILITY.md).

This is an independent community project, not affiliated with or endorsed by VRChat or VRCX.

## Run locally

Use Node.js 22 and npm:

```sh
npm ci
npm run dev
```

To check the production build:

```sh
npm run build
npm run preview
```

The development and preview servers bind to localhost. No database server or VRChat login is required.

## Validation

```sh
npx playwright install chromium
npm test -- --workers=3
python -m unittest discover -s tests -p "test_*.py"
```

Browser checks use synthetic databases. The test runner starts a production preview on port 4173 and a development server on port 4174. Both ports must be free. Tests and development fixtures are outside the production application entry.

## GitHub Pages

The [deployment workflow](.github/workflows/pages.yml) runs manually from the Actions tab on main. It installs locked dependencies, builds for `/VRCX-Rewind-2026/` and publishes only `dist/`. A source push does not trigger deployment.

After the first upload, select **Settings > Pages > GitHub Actions**, then run **Deploy GitHub Pages** from **Actions**. See [release checks](docs/RELEASE_CHECKS.md) for checks that require the hosted site.

## Code reuse and permissions

The project owner's code is currently unlicensed; no general permission to reuse, modify or redistribute it is granted. Contact [pearl.vrc@gmail.com](mailto:pearl.vrc@gmail.com) for permission before reusing the code or publishing your own version. Public GitHub viewing/forking rights and applicable legal exceptions remain unaffected. Third-party dependencies, fonts, music and other assets retain their respective rights and terms; this notice does not replace them.

See [GitHub's explanation of repositories without a license](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) and [third-party notices](docs/THIRD_PARTY_NOTICES.md).

Soundtrack attribution, source uploads, license links and audio-change notices are included in [music credits](public/audio/CREDITS.txt) and the site’s Music credits section. Music licenses are separate from the application code’s permission notice.
