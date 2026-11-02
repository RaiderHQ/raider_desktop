# trace-v1-mocked fixture

A `raider-trace` version 1 zip from ruby_raider 3.14.0 (branch feat/network-mocking, e2e "Network mocking" on headless Chrome, 2026-11-02).

`trace.json` `network[]` has the new optional `mocked` field (spec: docs/superpowers/specs/2026-11-02-network-mocking-design.md, "Trace: the one coupling point"):

- `GET …/mock` — no `mocked` field (a real request).
- `GET …/api/users` — `"mocked": "fulfilled"`, status 200 → badge "Mocked".
- `GET …/api/fail` — `"mocked": "failed"`, no status → badge "Blocked by test".

Absent field = not mocked (a pass-through is not marked). Unknown values: show no badge.
