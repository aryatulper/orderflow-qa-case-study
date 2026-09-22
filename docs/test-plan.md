# Risk-based test plan

## Objective

Show that the order lifecycle respects stock, financial and authorization invariants across UI, API and PostgreSQL. The test oracle is the written requirement, not merely the current UI behaviour.

## Scope and priority

| Risk | Impact | Likelihood | Priority | Primary evidence |
| --- | --- | --- | --- | --- |
| Duplicate payment from retry/concurrency | High | Medium | P0 | Newman replay, Playwright API, unique DB constraint |
| Over-refund or wrong refund state | High | Medium | P0 | Newman negative, unit boundary, SQL invariant |
| Cross-customer order access | High | Medium | P0 | Newman/Playwright API |
| Stock oversell or double restock | High | Medium | P0 | API negative, UI cancellation, transaction/SQL check |
| Wrong totals or persistence mismatch | High | Medium | P0 | API assertion, SQL validation |
| UI regression in checkout | Medium | Medium | P1 | Playwright checkout, cart and focus journeys |
| Mobile access or unclear refund input | Medium | Medium | P1 | Playwright viewport, demo account and admin refund checks |
| Error wording and visual clarity | Low | Medium | P2 | UI/UX design goal and manual exploratory charter |

## Test levels and selection

- **Unit:** pure state transitions, numeric boundaries and refund calculation.
- **API:** request/response contract, negative input, authorization, idempotency and lifecycle mutations. Newman offers a portable collection that an interviewer can run directly.
- **UI:** paid checkout and cancellation/stock-return journeys, plus mobile sign-in, responsive overflow, order filtering and admin refund-form checks. Assertions prefer accessible names and state rather than coordinates.
- **Database:** independent invariant query, run after the workflow suites.
- **Exploratory/manual:** use the charter below for interactions and edge cases not worth automating yet.

Tests are run serially in CI on a fresh Compose database. The API suite uses its own newly created orders. UI tests use fresh browser contexts. Products have generous stock except a dedicated limited-stock negative fixture. No third-party service is used.

## Entry, exit and reporting

Entry: the app health endpoint succeeds and seeded accounts/products exist. Exit: typecheck, unit, Newman, Playwright and SQL checks pass, or a failure is explained with attached JUnit/HTML/trace evidence. A failing pipeline must not be represented as a successful release.

The CI artifact contains Newman JUnit, Playwright JUnit/HTML and traces/screenshots on failure. Report genuine findings through the GitHub issue template; include requirement and test IDs, build SHA, preconditions, exact steps, expected/actual, severity and evidence.

## Exploratory charter (30 minutes)

**Mission:** challenge assumptions around order changes and money. Use both customer accounts and admin. Try browser refreshes between each step, repeated action clicks, altered request bodies, boundary quantities, and returning to old tabs. Compare UI/API responses and SQL rows. Record each observation as a note, then file a bug only when a written requirement is violated. Do not treat a lack of a specified feature (for example shipment) as a defect.
