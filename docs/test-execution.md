# Local execution record

Run on 2026-09-21 against a temporary local PostgreSQL 17.10 cluster and the Node.js app, then repeated on a newly created empty database to verify first-start schema/seed behaviour. The original version also passed [GitHub Actions](https://github.com/aryatulper/orderflow-qa-case-study/actions/runs/35650341805).

| Check | Result |
| --- | --- |
| TypeScript build/typecheck | Passed |
| Domain unit tests | 4 passed |
| Newman API collection | 17 requests, 17 assertions passed |
| Playwright Chromium UI/API | 7 tests passed after BUG-001 regression fix |
| PostgreSQL invariant query | Passed; zero anomaly rows |
| Clean-database API/UI/SQL rerun | Passed: 17 Newman assertions, 7 Playwright tests, zero SQL anomalies |
| Delivery archive command | Passed; archive contains compiled app, static UI, schema and package manifests |
| Local Docker Compose build/run | Not run: Docker is not installed on this machine. Workflow is committed for GitHub Actions verification. |

The first Playwright attempt exposed a **test locator ambiguity** caused by existing order history. The test was narrowed to the cart before the passing rerun; that was not an application defect. A separate manual browser pass found [BUG-001](defects/BUG-001.md), which was fixed and covered by a new visibility assertion.

## UI/UX revision verification — 2026-09-22

The redesigned storefront was checked against a separate seeded PostgreSQL database and visually reviewed at desktop and mobile widths. The [design goal](design-goal.md) defines the intended change and acceptance checks.

| Check | Result |
| --- | --- |
| TypeScript typecheck and build | Passed |
| Domain unit tests | 4 passed |
| Newman API collection | 17 requests, 17 assertions passed |
| Playwright Chromium UI/API | 10 passed: 7 existing lifecycle tests and 3 new UI/UX tests |
| Responsive overflow | None at 390, 768 or 1280 px |
| PostgreSQL invariant query | Passed; zero anomaly rows |
| Screenshot | Updated from a clean seeded database in `docs/assets/storefront.png` |
| Local Docker Compose | Not run; Docker is not installed here. See [GitHub Actions](https://github.com/aryatulper/orderflow-qa-case-study/actions) for the container-based run. |
