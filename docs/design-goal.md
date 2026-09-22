# UI/UX design goal

**Goal (2026-09-22):** make OrderFlow feel like a clear transaction workbench, not a generic demo storefront, while preserving every order, payment, cancellation and refund rule.

The previous large slogan and repeated product cards made the real test data harder to scan. The revised interface uses a compact lifecycle guide, product rows with visible stock, a distinct reservation area and a readable order ledger. It uses typography, spacing and state color rather than decorative stock imagery, gradients or invented product photography. Simulation limits remain visible before any action.

## Acceptance checks

- On a 390 px phone, sign-in is in the initial viewport; account shortcuts do not replace real authentication.
- Catalog, checkout and orders have no horizontal overflow at 390, 768 or 1280 px.
- Cart count, pending actions, status badges, order focus and order filtering make state changes observable.
- The admin refund form shows the remaining balance and rejects invalid amounts before submission; the API still enforces the rule.
- Keyboard users get a skip link, visible focus and status/error announcements.
- Existing API contracts and all order-lifecycle regression tests remain green.

Evidence: [responsive and interaction checks](../tests/e2e/ui-quality.spec.ts), [local execution record](test-execution.md), and the [current GitHub Actions runs](https://github.com/aryatulper/orderflow-qa-case-study/actions).
