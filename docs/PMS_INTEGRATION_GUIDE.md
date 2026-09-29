# LingsaaAI — Project Management (PMS) Module: Design & Integration Guide

Scope: design the PMS module (frontend then backend), then merge it into the root app `Lingsaa_Accounts`.
Reference product: Jira / Zoho Projects style features, filtered to what fits your 13-sub-module requirement document.

---

## 0. What I found in your three code bases (verified)

| Project | State | Consequence |
|---|---|---|
| `Lingsaa_Accounts` (root) | Next.js 16 **Pages Router**, React 19, MUI 5, Tailwind 4, RTK Query, CASL (bypassed), Vuexy template. No backend inside; calls external `MASTER_SERVICE` and `FINANCE` APIs. Already has a placeholder `appModules/projects/{clients,projects}` (8 pages) and two nav arrays: `projectNavRoutes` and an unfinished `projectManagementNavRoutes` (points at an HRM profile page by mistake). | PMS UI merges here as `appModules/projects/*`. |
| `frontend` (PMS) | **Empty scaffold**: App Router, one page, empty Redux store, same dependency list as root. | Nothing to migrate. Build PMS screens directly inside the root project (Pages Router). Delete this scaffold afterwards. |
| `backend` (PMS) | FastAPI + SQLAlchemy + SQL Server. Legacy app `local/init.py` has project/task/team CRUD under `/admin`. `pms_api/` is a clean stub (only `/api/health`). Tenancy by `client_id` column. | Build PMS as a **separate FastAPI service** (the root has no backend to merge into). Use `pms_api/` as the base; port logic from legacy `shared/`. |

### Problems that must be fixed (not optional)
1. **PMS routes have no authentication**; `client_id`/`user_id` are taken from the query string, so any caller can read any tenant's data. Take both from the JWT only.
2. `iam/auth.py` imports a `UserSession` model that does not exist; `is_authorised` uses `eval()`. Replace, do not port.
3. **Live secrets** are in `backend/local/dev.env`, `production.env`, `pms_api/.env`. Rotate them and stop committing them.
4. `projects.project_name` is typed `Integer`. Fix to `String`.
5. Root app: `AuthContext` is stubbed and `proxy.js` guard is a no-op, so real enforcement today is sidebar filtering + per-screen permission checks. The PMS backend must therefore enforce permissions **server-side**.
6. Neither folder is a git repository. **Run `git init` and commit before merging anything.**

---

## 1. Target architecture

```
Browser ── Lingsaa_Accounts (Next.js, Pages Router)
             ├─ appModules/projects/**        <- PMS screens (new)
             ├─ store/apps/pms/*Api.js        <- RTK Query (new) -> NEXT_PUBLIC_PMS_API_URL
             └─ existing login / ModuleContext / PermissionProvider (reused)
                    │  Bearer JWT (same token issued by MASTER service)
                    ▼
        PMS API (FastAPI, new service, port 8001)  ──  SQL Server, schema `projectmanagement`
             ├─ validates JWT (shared secret / JWKS from MASTER service)
             ├─ tenant = client_id from token
             └─ permission check per endpoint (permission_id / action)
             Integrations: MASTER (plans/permissions), CRM (clients), HRMS (employees), Accounts (invoices)
```

Decision: one JWT, issued by the existing MASTER service. PMS API only **verifies** it. No second login.

### Permission model mapping (Master Admin → Super Admin → Users)
1. **Master Admin** creates plans and attaches the "Project Management" module + its nav items/permissions (existing `master/plans`, `modules`, `navItems`, `actionAccess` screens). Add PMS rows there; no new UI needed.
2. **Super Admin** logs in; `userInfo.modules[]` contains the PMS module only if the plan includes it → `ModuleContext` shows it → sidebar built by `filterNavByPermissions` using `nav_link_fe` == the PMS route `path`.
3. **Super Admin creates users / roles** (existing screens) and ticks PMS permissions (view/add/edit/delete) per screen.
4. **Screen level:** each PMS page calls `usePermissionId('<ComponentName>')` + `PermissionProvider.fetchPermissions` (existing pattern) and hides buttons via `userPermissions.add/edit/delete`.
5. **API level (new):** PMS API receives `permission_id` header/param + JWT and confirms with MASTER `getUserPermissionNamesList` (cache 60 s). Frontend checks are UX only.

Rule for every PMS route path: it must equal the `nav_link_fe` registered in Master → navItems, otherwise the sidebar filter hides it.

---

## 2. Feature scope (Zoho/Jira ideas added to your document)

| # | Your sub-module | Extra features added | Phase |
|---|---|---|---|
| 1 | Initiation & Setup | Project templates, project code `PRJ-YYYY-XXXX`, approval workflow, favourites | 1 |
| 2 | WBS / Planning | Phases→tasks→subtasks, Gantt with dependencies, baseline | 2 |
| 3 | Resources | Allocation %, conflict alert, workload heat-map | 2 |
| 4 | Task mgmt | **Kanban board (drag-drop)**, list, my-tasks, labels, watchers, comments, @mentions, activity log, saved filters | 1 |
| 5 | Timesheets | Weekly grid, timer, billable flag, approval | 2 |
| 6 | Costing | Budget heads, expenses + receipts, variance | 3 |
| 7 | Milestones | Deliverables, client sign-off | 2 |
| 8 | Collaboration | Comments, files (Azure Blob), notifications | 1–2 |
| 9 | Risk/Issue/CR | Registers + CR approval | 3 |
| 10 | Billing | Milestone / T&M invoice → Accounts module | 3 |
| 11 | Closure | Checklist, feedback, PIR | 3 |
| 12 | Dashboard | Health RAG, burndown, utilization, KPIs, export | 2 |
| 13 | Integrations | CRM clients, HRMS employees, Payroll rate, Accounts GL | 3 |

Build in phases; Phase 1 = usable product (projects, tasks, kanban, comments, files, permissions).

---

## PART A — FRONTEND (step by step)

### A1. Preparation
1. `git init` in `LINGSAA_PMS` (or the root project) and commit the current state.
2. Add env var in `Lingsaa_Accounts/.env`: `NEXT_PUBLIC_PMS_API_URL=http://localhost:8001/api` (add commented Local/DEV/Prod blocks like the existing ones).
3. Install only what is missing: `npm i @dnd-kit/core @dnd-kit/sortable gantt-task-react` (kanban + Gantt). Everything else (MUI, recharts, fullcalendar, RTK, react-hook-form, yup) is already present.

### A2. Folder layout (inside `src/`)
```
pages/appModules/projects/
  dashboard/index.js              # sub-module 12
  projects/projectsList|projectsGrid|projectsDetails   # exist; rewire to API
  projects/create/index.js        # wizard (setup + stakeholders + docs)
  projects/tasks|tasksDetails     # exist; add board + gantt tabs
  board/index.js                  # kanban
  gantt/index.js
  timesheets/index.js
  resources/index.js
  milestones/index.js
  budget/index.js  expenses/index.js
  risks/index.js  issues/index.js  changeRequests/index.js
  invoices/index.js
  reports/index.js
  settings/{types,categories,domains,workflow}/index.js
views/projects/                   # presentational components (tables, cards, forms, drawers)
store/apps/pms/pmsApi.js          # RTK Query endpoints
store/apps/pms/pmsBaseQuery.js    # baseQuery pointing at PMS_BASE_URL
```
Existing pages `clients/*` in `appModules/projects` should read clients from the CRM module instead of a separate list; keep them only if CRM is not deployed.

### A3. API layer
1. `pmsBaseQuery.js`: copy `store/rtkQuery/baseQuery.js`, change base URL to `NEXT_PUBLIC_PMS_API_URL`. Keep bearer token, 401 auto-logout and toast handling. **Do not send `client_id`/`user_id` as params** — the server derives them from the token. Send `permission_id` as header `X-Permission-Id`.
2. `pmsApi.js`: `createApi` with tag types `Project, Task, Timesheet, Milestone, Risk, Issue, CR, Invoice, Budget, Expense`. Endpoints listed in Part B §B4. Use `providesTags/invalidatesTags` so lists refresh after mutations.
3. Register `pmsApi.reducer` and `pmsApi.middleware` in `store/index.js`.

### A4. Navigation & permissions wiring
1. In `navigation/vertical/navRoutes.js` replace both `projectNavRoutes` and the broken `projectManagementNavRoutes` with **one** array `projectNavRoutes` (grouped: Dashboard, Projects, Board, Gantt, Timesheets, Resources, Milestones, Budget, Risks/Issues/CR, Invoices, Reports, Settings). Each leaf `path` = its page route.
2. Delete `projectManagementNavRoutes` and check `navigation/vertical/index.js` still lists `project` in `navigationSets`.
3. In Master Admin → Nav Items / Action Access, create an entry per PMS path with view/add/edit/delete actions; add them to the PMS module in a plan.
4. In each page: `const { permissionId } = usePermissionId('ProjectsList'); useEffect(() => fetchPermissions(permissionId))`, render nothing until `permissionLoaded`, gate buttons on `userPermissions`.

### A5. Screens (build order)
Phase 1:
1. **Projects list/grid** – filters (status, priority, client, manager, dates), status count chips (Draft, Pending Approval, Approved, Active, On Hold, Closed), pagination, export.
2. **Create/Edit project wizard** – step 1 basics (name, client from CRM, type, category, domain, dates, budget, manager), step 2 stakeholders, step 3 documents (charter/SOW/contract/NDA). react-hook-form + yup.
3. **Project details** – tabs: Overview, Tasks, Board, Files, Team, Activity. Status change with approval buttons.
4. **Tasks list + task drawer** – fields per your spec; subtasks; comments with @mentions; attachments; activity log.
5. **Kanban board** – columns To Do / In Progress / Testing / Done (configurable); drag-drop with `@dnd-kit`; optimistic update via RTK `onQueryStarted`.
Phase 2: Gantt, timesheets (weekly grid + approve), resources & conflicts, milestones/deliverables, dashboard.
Phase 3: budget/expenses, risks/issues/CR, invoices, closure + feedback, reports.

### A6. Cross-cutting
- Notifications: reuse `react-hot-toast`; add a bell-icon dropdown fed by `GET /notifications`.
- Date/currency: reuse `fyContext` and `currencyContext`.
- Idle lock, logout: inherited from existing `useIdleLogout`.
- Multi-tab consistency: do not store PMS state in localStorage; RTK cache only.

### A7. Frontend done-checklist
- [ ] Sidebar shows PMS only for plans that include it
- [ ] User without "view" cannot open the page by typing the URL (page renders access-denied)
- [ ] Buttons hidden per add/edit/delete
- [ ] No `client_id`/`user_id` sent by the client
- [ ] `npm run build` passes (the build uses webpack, 8 GB heap)

---

## PART B — BACKEND (step by step)

### B1. Service skeleton (`backend/pms_api/`)
```
app/
  main.py                 # FastAPI, CORS (root app origin only), routers, /api/health
  core/config.py          # pydantic-settings: DB_*, JWT_*, AZURE_*, MASTER_API_URL
  core/security.py       # verify JWT, get_current_principal()
  core/permissions.py    # require_permission("view"|"add"|"edit"|"delete")
  db/session.py           # engine + SessionLocal
  db/base.py
  models/*.py             # one file per entity
  schemas/*.py            # Pydantic request/response
  repositories/*.py       # queries (always filtered by client_id)
  routers/*.py            # thin controllers
  services/*.py           # business logic (workflow, costing, billing)
  integrations/{master,crm,hrms,accounts,azure_blob,notify}.py
alembic/                  # migrations
tests/
```
Stack: FastAPI, SQLAlchemy 2, Alembic, pydantic-settings, python-jose (JWT), pyodbc, azure-storage-blob. Python 3.12.

### B2. Auth & tenancy (do this first)
1. `get_current_principal`: decode bearer JWT (same secret/algorithm as MASTER; **use a separate env var**, not committed) → `Principal(client_id, user_id, role, is_superadmin)`. Reject expired/invalid with 401.
2. Every repository function takes `principal` and always applies `WHERE client_id = principal.client_id`. Never accept `client_id` from the request.
3. Row visibility: superadmin sees all client projects; employees see projects where they are manager, stakeholder or team member (not "created by me" only, which the legacy app did).
4. `require_permission(action)`: reads `X-Permission-Id`, calls MASTER user-permission endpoint (cached), returns 403 if action not allowed. Never use `eval`.
5. Audit trail: SQLAlchemy event hook writes `tbl_audit_log(entity, entity_id, action, old, new, user_id, at)`.

### B3. Database (schema `projectmanagement`, all tables: `id, client_id, created_by, updated_by, created_at, updated_at, is_deleted`)
Existing (port + fix): `projects`, `project_files`, `tasks`, `teams`, `project_type`, `project_category`, `project_business_domain`, `project_tags`, `project_stakeholders`.
New:
- `task_status`/workflow columns, `task_dependencies(task_id, depends_on_id, type)`, `task_comments`, `task_watchers`, `task_labels`, `activity_log`
- `project_resources(project_id, employee_id, role, allocation_pct, from, to, cost_per_hour)`
- `timesheets`, `timesheet_entries(task_id, date, hours, billable)`, approvals
- `budgets(project_id, cost_head, amount)`, `expenses(+receipt_url, status)`
- `milestones`, `deliverables`, `milestone_dependencies`
- `risks`, `issues`, `change_requests`
- `invoices`, `invoice_lines`
- `closure_checklist`, `client_feedback`, `pir`
- `notifications`, `audit_log`
Numbering: `PRJ-YYYY-XXXX` generated in a service using a per-client-per-year counter row locked `WITH (UPDLOCK)` to avoid duplicates.
Manage everything through **Alembic**; do not use `create_all` in production.

### B4. API contract (prefix `/api`, all authenticated)
| Area | Endpoints |
|---|---|
| Projects | `GET /projects` (filters+paging+counts), `POST /projects`, `GET/PUT/DELETE /projects/{id}`, `POST /projects/{id}/status`, `POST /projects/{id}/files`, `DELETE /projects/{id}/files/{fid}` |
| Lookups | `GET/POST /project-types`, `/project-categories`, `/project-domains` |
| Tasks | `GET /projects/{id}/tasks`, `POST /tasks`, `PUT/DELETE /tasks/{id}`, `POST /tasks/{id}/move` (board), `POST /tasks/{id}/comments`, `GET /tasks/{id}/activity` |
| Gantt | `GET /projects/{id}/gantt` (tasks + dependencies + critical path) |
| Resources | `GET/POST /projects/{id}/resources`, `GET /resources/utilization`, `GET /resources/bench` |
| Timesheets | `GET /timesheets?week=`, `POST /timesheets`, `POST /timesheets/{id}/submit|approve|reject` |
| Costing | `GET/PUT /projects/{id}/budget`, `POST /expenses`, `POST /expenses/{id}/approve`, `GET /projects/{id}/variance` |
| Milestones | `GET/POST /projects/{id}/milestones`, `POST /milestones/{id}/deliverables`, `POST /milestones/{id}/accept` |
| Risk/Issue/CR | CRUD on `/risks`, `/issues`, `/change-requests`, `POST /change-requests/{id}/approve` |
| Billing | `POST /projects/{id}/invoices/generate`, `GET /invoices`, `POST /invoices/{id}/approve` |
| Closure | `POST /projects/{id}/close`, `POST /projects/{id}/feedback` |
| Dashboard | `GET /dashboard/summary`, `/dashboard/health`, `/dashboard/kpis` |
| Misc | `GET /notifications`, `GET /export/projects?format=xlsx|csv|pdf`, `GET /health` |

Conventions: JSON only, `{ "data": ..., "meta": {page,total} }`, errors `{ "detail": ..., "code": ... }`. Uploads go to Azure Blob; return short-lived SAS URLs (reuse logic from `azure_service/AzureBlobManager.py`).

### B5. Business rules
- Project workflow: Draft → Pending Approval → Approved → Active → On Hold/Closed; each transition checks role and logs activity.
- Task % complete = weighted by estimated hours of subtasks; milestone % from linked tasks.
- Timesheet rejected if hours in a day exceed allocation or 24 h; missing-submission reminder job.
- Budget alert at 80% and 100% of a cost head.
- Invoice: T&M pulls approved billable hours × rate; milestone pulls accepted milestones; push to Accounts via `integrations/accounts.py`.
- Background jobs (APScheduler or Celery): overdue task alerts, milestone slippage, weekly stakeholder summary email, approval reminders.

### B6. Porting from the legacy backend
| Legacy | Action |
|---|---|
| `shared/database/models.py` | Port to `models/`, fix `project_name` type, add Alembic migration |
| `repositories/Projects, Tasks, Teams` | Port queries; replace query-string `client_id`/`user_id` with principal |
| `azure_service/AzureBlobManager.py` | Copy to `integrations/azure_blob.py` |
| `shared/pdf`, `communication` | Copy when invoices/notifications are built |
| `iam/auth.py`, `is_authorised` | **Do not port** |
| payment / AES / CMM parsers | Not PMS; leave behind |
| `local/*.env` | Delete from repo; use a secret manager or untracked `.env` |

### B7. Testing & ops
- pytest with a test SQL Server DB (or SQLite for repository tests); mandatory tests: cross-tenant access returns 404/403, permission denial returns 403, workflow transitions.
- Dockerfile + `uvicorn app.main:app --port 8001`; add to your existing pm2/GitHub Actions deploy; reverse-proxy `/pms-api` if you want a single origin.

---

## PART C — MERGE PLAN (into `Lingsaa_Accounts`)

1. **Safety:** `git init`, commit; create branch `feature/pms`.
2. **Backend first, standalone:** finish B1–B2 and `/health` + Projects CRUD; verify with Swagger and a JWT from the MASTER service.
3. **Master data:** in the Master Admin UI add PMS module, nav items, actions; attach to a test plan; create a test Super Admin and a restricted user.
4. **Frontend wiring:** A3 (API layer) → A4 (nav+permissions) → replace existing placeholder pages under `appModules/projects` one by one with real data.
5. **Vertical slices:** projects → tasks/board → (Phase 2) → (Phase 3). After each slice, run the checklists below.
6. **Cleanup:** remove `LINGSAA_PMS/frontend` scaffold, legacy `backend/local` app, `projectManagementNavRoutes`, unused mock data in the placeholder pages.
7. **Release:** env vars for each environment, DB migration run, deploy PMS API, deploy root app (Docker/pm2), smoke test with Master Admin → Super Admin → User.

### Acceptance tests (end-to-end)
- Plan without PMS → Super Admin does not see PMS.
- Plan with PMS → Super Admin sees it; user with only "Tasks: view" sees only Tasks, cannot add.
- Tenant A cannot read tenant B's project by ID (expect 404).
- Direct API call without token → 401; without permission → 403.
- Kanban move persists after refresh; two users see consistent state.

---

## Open questions to confirm
1. Should PMS use the **same SQL Server** as other modules (schema `projectmanagement`) or its own database?
2. Does the MASTER service expose the JWT secret/JWKS to PMS, or should PMS call a `/verify` endpoint?
3. Are CRM clients and HRMS employees reachable by API today, or should PMS keep its own client/employee tables initially?
4. Which phase should be built first (recommended: Phase 1)?
