# Knip cleanup review and plan

## Scan

- Knip was added as a development dependency and run with `npx knip --reporter compact`.
- The initial scan exhausted Node's default heap while parsing the very large TypeScript files. The completed scan used an 8 GB Node heap.
- No Knip auto-fix was run. No source files or project data were deleted.
- The dependency install reported 23 npm audit advisories (12 moderate, 10 high, 1 critical). Review the full audit separately before attempting upgrades; do not run `npm audit fix --force`.
- A second scan used `npx knip --production --reporter compact` with the same heap setting.

## Findings

| Category | Count | What Knip reported |
|---|---:|---|
| Unused files (all dependencies) | 47 | 14 archived components, `check-settings.ts`, `public/sw.js`, unused-looking dashboard/KAM/student/UI components, and `src/lib/mailAsync.ts`. |
| Unused files (production mode) | 55 | The same broad categories plus migration/schema scripts, test setup, and library files whose consumers are only in development/tests. These scripts/tests are not production runtime code; do not delete them based on this count. |
| Unused dependencies | 1 | `sonner`. |
| Unlisted dependencies | 2 | `sqlite3` and `sqlite` in `scripts/migrate_sqlite_to_postgres.mjs`; `@libsql/client` in `scripts/sync_db.mjs`. |
| Unused exports | 43 | Helper functions/constants in dashboards and libraries, plus default/named exports from components. |
| Unused exported types | 35 | Types/interfaces in dashboards, components, context, and libraries. |
| Duplicate exports | 17 | Components exporting the same component both named and default, plus two priority-split exports. |

Production mode additionally reported 54 unused exports and 34 unused exported types. Those counts differ from the full scan because production mode excludes test and development entry points. Duplicate-export count remained 17.

### Package review

- **Potentially unused:** `sonner` is the only installed dependency reported unused by both scans. Inspect imports and package usage before removing; it may be intentionally loaded indirectly.
- **Referenced but undeclared:** `sqlite3` and `sqlite` are imported by the migration script; `@libsql/client` is imported by the DB sync script. Verify whether these operational scripts are supported. If they are, declare the required packages in the appropriate dependency group; if retired, document their replacement before deleting either script or package.
- **Unlisted packages are not confirmed missing at runtime.** They may be transitive/hoisted in the current install, which can make a local script work accidentally. Test each script in a clean install before relying on it.
- Knip did not report another unused package. It does not assess whether versions are outdated or vulnerable; that requires a separate package audit.

The complete console output from the scan was not saved as a report file. Re-run Knip with `--reporter markdown` or `--reporter json` when beginning the cleanup work so the findings can be tracked and compared.

## Safe interpretation

Knip reports potential dead code, not authoritative permission to delete it. This repository uses Next.js route conventions, service workers, dynamic imports, role-driven UI, scripts, and archived code. In particular:

- Treat every item under `archive/` as intentional retention until the archive policy and external references are checked.
- Verify `public/sw.js` is not registered by URL or referenced by deployment configuration; a service worker may be loaded by path, invisible to ordinary import analysis.
- Check `src/components/ui/*` against dynamic imports, registries, and role-driven rendering before removal.
- Confirm script-only dependencies against package-manager and deployment workflows. A script can be intentionally supported even when absent from app imports.
- Treat unused exports/types as candidates for API cleanup, not dead files. Next.js components and shared types may be consumed indirectly or outside the detected entry graph.
- Duplicate named/default exports are usually low-risk cleanup, but check imports first and standardize one export convention at a time.

## Prioritized cleanup plan

### Phase 1: Establish a repeatable baseline

1. Add a reviewed Knip config with explicit Next.js/app entry points, test files, scripts, and archive policy. Do not blanket-ignore the whole app or archive without documenting why.
2. Save a Markdown or JSON baseline report and record the exact Knip version and command.
3. Run the scan in normal and production modes; compare the difference so test/dev tooling is not mistaken for production baggage.

### Phase 2: Review dependency findings

1. Trace `sonner` and check whether any toast/provider is imported directly or loaded dynamically. If unused, remove it and its lockfile entries in a focused change.
2. Confirm whether sqlite drivers are intentionally required for migration/sync scripts and whether those scripts are supported in CI/deployment. If supported, declare exact direct dependencies; otherwise retire scripts only after confirming their replacement.
3. Run supported operational scripts in a clean install to detect accidental reliance on transitive packages. Do not let an existing node_modules tree serve as proof that dependencies are correctly declared.
4. Check package usage and lockfile consistency before changing any runtime dependency. Review the reported npm advisories and package version freshness independently.

### Phase 3: Low-risk code cleanup

1. Inspect each duplicate export and standardize named/default imports without changing component behavior.
2. Remove clearly private, unreferenced helper exports only after checking repository-wide references and dynamic import patterns.
3. Keep exported types that are part of module contracts or tests even if Knip sees no in-repo consumer.

### Phase 4: File-level review

1. Build a reference map for each unused file (static imports, dynamic imports, URL/path references, route conventions, scripts, docs, and deployment config).
2. Review the 14 archived files with the project owner; decide whether `archive/` is retained history, a migration source, or safe-to-delete storage.
3. Review UI components in small batches and verify the relevant roles/screens before removing any.
4. Check service worker registration and cache behavior before touching `public/sw.js`.
5. Remove only confirmed dead files in a separate, reviewable commit, then run typecheck, lint, tests, build, and Knip again.

## Acceptance criteria

- Every candidate is classified as remove, retain intentionally, or investigate, with a reason.
- No user data, database files, backups, uploads, generated artifacts, or archive content are removed as part of an automated fix.
- App behavior, role access, offline/service-worker behavior, migrations, and deployment scripts remain intact.
- A repeat Knip run has no unexplained findings; intentional exceptions are documented in config or this plan.
