# Changelog

## 0.1.1

### Patch Changes

- 887c381: Harden notification target-path validation and schema drift checks, pause polling in initially hidden tabs, and align the notification bell with the shared shell header controls.

## 0.1.0

### Minor Changes

- 055f88c: Add the Phase 1 shared notification capability: transaction-aware first-write-wins notification
  writes, ownership-safe inbox mutations, a documented Prisma contract and schema drift checker,
  plus a callback-driven frontend notification bell with bounded polling, optimistic read actions,
  responsive states and accessibility primitives.

All notable changes to `@appspine/notification` are documented here.

## 0.0.0

- Added the Phase 1 transaction-aware notification service, Prisma contract,
  validation helpers, and testing utilities.
