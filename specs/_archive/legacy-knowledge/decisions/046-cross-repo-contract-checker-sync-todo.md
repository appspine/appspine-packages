---
scope: framework
type: decision
status: active
owner: framework-team
created_at: 2026-08-12
---

# 046 Cross-Repo Contract Checker Synchronization TODO

## Background

Following Phase 2 of repo restructure, `contract-cli.mjs` and `knowledge/contracts/` have been moved to `appspine-packages`.
The generated `check-generated-integration-contracts.mjs` present in `appspine-app-template` and consuming app forks (`approve`, `projects`, `wiki`) are verbatim copies of the generator template.

## Action Item / TODO

- [ ] Implement an automated CI gate (or template propagation check) to ensure generator updates in `appspine-packages` are automatically verified against all app forks.
