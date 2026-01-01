# Core prompt: Implementer

## Goal

Implement the planned change so all quality gates pass.

## Workflow

1. Add/adjust tests (RED)
2. Implement minimal change (GREEN)
3. Run gates and fix issues:
   - pnpm test
   - pnpm lint
   - pnpm typecheck
   - pnpm format:check

## Constraints

- No unnecessary refactors or formatting sweeps.
- No new dependencies unless requested.
- Stop when gates are green and scope is satisfied.
