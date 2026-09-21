# Requirements traceability matrix

`Automated` means a committed executable check exists. `Manual` means the case is specified but not yet automated. This distinction avoids overstating coverage.

| Rule | Risk | Test cases | Automation / evidence |
| --- | --- | --- | --- |
| BR-01 server-calculated cents | P0 | TC-03, TC-05, TC-21 | Newman catalog/order; Playwright UI; SQL total query |
| BR-02 distinct positive items | P1 | TC-06, TC-07 | Unit positive integer; manual API cases |
| BR-03 atomic stock validation | P0 | TC-04 | Newman insufficient-stock request; Playwright parallel-order oversell check; SQL negative-stock query |
| BR-04 reserve/return stock once | P0 | TC-05, TC-14, TC-15, TC-22 | Playwright UI cancellation; Newman repeat cancellation |
| BR-05 one idempotent payment | P0 | TC-10–13, TC-21 | Newman payment/replay/new-key; Playwright API + UI; unit state check |
| BR-06 cancellation state | P0 | TC-14–16 | Newman pending/repeat; Playwright API paid cancellation; unit transition |
| BR-07 admin/refund ceiling | P0 | TC-17–20 | Newman admin/over/partial/full; Playwright API; unit boundary |
| BR-08 return does not restock | P1 | TC-18 | Manual API + SQL spot-check |
| BR-09 order privacy and roles | P0 | TC-01, TC-02, TC-08, TC-09, TC-17 | Newman cross-read/role; Playwright API cross-read/cancel |
| BR-10 persisted invariants | P0 | TC-23 | `npm run test:sql` / `db/validations.sql` |

Coverage gaps are intentional and visible: paid cancellation, malformed-item combinations and physical stock after return refund should be automated next if the project grows. Do not infer 100% coverage from a green CI run.
