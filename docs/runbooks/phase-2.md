# Phase 2 — Property, Projects and Planning

## UI journeys

### Tenant admin builds inventory
1. Login at `/login` (Green Valley admin).
2. Open **Projects** in the sider → create or open **Green Valley Residency**.
3. **Structure** tab: add Block → Tower A/B → floors → unit categories (2BHK/3BHK).
4. **Units** tab: Generate units (floor range + units/floor) → change status to `reserved` (history recorded).
5. **Tasks** tab: milestones, tasks, FS dependencies (cycles rejected).
6. **BOQ / Drawings / RFIs / Issues**: attach planning artefacts; re-posting a drawing number creates a new immutable version.

### Scoped engineer
1. Login as Meera (`meera@greenvalley.example` / `Meera@12345`).
2. Only assigned projects appear; other projects return 403.

## API smoke

```bash
# After tenant login cookies
curl -b cookies.txt http://localhost:3000/api/v1/projects
curl -b cookies.txt -X POST http://localhost:3000/api/v1/projects/$ID/generate-units \
  -H 'content-type: application/json' \
  -d '{"towerId":"...","floorFrom":1,"floorTo":2,"unitsPerFloor":2,"unitPrefix":"A"}'
```

## E2E

```bash
$env:BASE_URL='http://localhost:3000'
node scripts/e2e-phase2.js
```

## Seed note

`pnpm --filter @hippo/db db:seed` with `seedDemoUsers` creates GVR, Block A, Tower A/B, sample floors/categories, and Meera scoped to Tower A location.
