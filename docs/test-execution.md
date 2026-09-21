# Local execution record

Run on 2026-09-21 against a temporary local PostgreSQL 17.10 cluster and the Node.js app, then repeated on a newly created empty database to verify first-start schema/seed behaviour. This record is not a substitute for the first GitHub Actions run, which has not yet occurred.

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
