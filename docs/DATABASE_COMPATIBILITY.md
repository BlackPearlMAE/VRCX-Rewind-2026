# Database compatibility

The supported VRCX database migration version is **18**. This is the value of `config:vrcx_databaseversion` in `configs`, not a SQLite engine version or a VRCX application release number. Compatibility was rechecked by the project owner before this release; an unknown newer migration requires an updated build.

Selection checks the SQLite header, recognized activity tables, the migration marker and required activity columns. It uses bundled sql.js 1.16.0 in a browser worker, with `query_only` enabled and `trusted_schema` disabled. It does not enumerate unrelated configuration values or run a full integrity scan. Validation is not a guarantee that every topic has complete history.

Required activity tables:

- `gamelog_location`: `id`, `created_at`, `location`, `world_id`, `world_name`, `time`.
- `cache_world`: `id`, `name`.

At least two recognized activity markers must be actual tables. Optional tables and recorded coverage determine whether particular Friends, notification or record topics are available. Missing topics show unavailable states.

The recap window is 2026 in Europe/Berlin, clipped at the current time. Estimates and partial/missing history are represented in the UI. Recorded time can include idle time.

## Multiple accounts

Files with multiple account histories require an explicit selection. The selector uses locally retained display names when available. Friends and profile queries use the selected account. Shared activity tables are used for playtime and world activity where VRCX does not record account attribution. Account-specific corrections are applied where supported; shared history is not represented as fully attributable to the selected account.

## Connection lifecycle

A validated read-only database connection is retained in worker memory. Actual timeline, records, Worlds and Friends calculations are queued with the opening timeline first. The application reuses completed recap results. There is no extra SQL benchmark, diagnostic batch, engine-version query or unused Worlds chart aggregation.

Replacing a file, changing account or closing the page releases the previous worker. Revision guards reject stale results. Imported data is not persisted. A 120-second validation watchdog releases an unresponsive worker; available browser memory still limits file size.

Close VRCX before making a standalone database copy. A selected SQLite file does not include uncheckpointed WAL contents, and Rewind does not modify or migrate the live database.
