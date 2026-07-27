# Contributing to Construction ERP

## Development Workflow

1. Pick a ready GitHub Issue
2. Confirm acceptance criteria
3. Create a branch from `main`:
   ```bash
   git checkout main
   git pull --rebase origin main
   git checkout -b feat/CRM-142-lead-state-machine
   ```
4. Implement changes with tests
5. Open a draft PR early
6. Request review when CI passes
7. Merge through the merge queue

## Branch Naming

| Prefix | Purpose |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `test/` | Tests |
| `refactor/` | Internal code improvement |
| `docs/` | Documentation |
| `chore/` | Tooling, configuration, maintenance |
| `hotfix/` | Urgent production correction |

## Before Opening a PR

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm test
pnpm build
```

## Code Review Requirements

| Change Type | Minimum Approval |
|---|---|
| Documentation | 1 |
| Standard feature | 1 |
| Database migration | 2 |
| Authentication/RBAC | 2 |
| Tenant isolation | 2 |
| Financial workflow | 2 |
| Inventory transaction | 2 |
| CI/CD or infrastructure | 2 |

## Commit Messages

Use conventional commits:

```
feat(CRM-142): add lead pipeline state machine
fix(PAY-181): correct demand letter timezone handling
test(PAY-208): add payment idempotency edge cases
refactor(PLAT-044): extract tenant context resolver
docs(ARCH-019): update event contract documentation
```

## Code Style

- JavaScript (ES modules) — no TypeScript
- ESLint for linting
- Prettier for formatting
- Follow existing patterns in each module
