# Testing Guide

Use this guide to choose the smallest correct validation command.

## Default Gates

- `npm run check`: lint + format check + unit tests
- `npm run smoke`: parse and startup-path validation
- `npm run test:integration`: cross-subsystem behavior
- `npm test`: unit + integration
- `npm run agent:tooling`: local developer-tooling validation only

## Which Gate To Run

- docs only: no code validation required
- agent tooling/docs: `npm run agent:tooling`
- single-subsystem JS change: `npm run check`
- startup or route wiring: `npm run smoke`
- db, routing, integration, or cross-service behavior: `npm run check && npm run test:integration`

## Testing Notes

- prefer narrow tests before broad gates
- do not replace tests with manual startup unless the behavior truly needs runtime verification
- partial mocks are common in the unit suite, especially around bot helpers
- CI should focus on `check`, `smoke`, and `test:integration`; `agent:tooling` is a machine-readiness check for local development
