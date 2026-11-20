# Oncordo Server — Agent Guidelines

Oncordo is a multi-tenant operations management backend for physical service-based businesses (indoor sports facilities, training centers, etc.).

## Domain Glossary

Keep these core domain concepts distinct—do not conflate them in schemas, services, or routes:

- **Tenant:** An isolated business organization (`Tenant` model, `tenantId` FK).
- **Booking:** A planned reservation.
- **Visit:** An actual customer arrival at a business location.
- **Service Session:** The actual delivery of a service (staff + resource assignment).
- **Order:** A record of products or services purchased.
- **Payment:** Money received against an order.
- **Course Enrollment:** A customer's enrollment in a course or batch.

## Tech Stack & Version Gotchas

- **Runtime & Package Manager:** Bun (`bun.lock`, `vercel.json` uses Bun `1.x`). Use `bun` / `bun run` / `bun add`, not `npm` or `yarn`.
- **Language & Modules:** TypeScript (`5.8.x`), ESM (`"type": "module"`). **Always include `.js` extensions on relative imports** inside `src/` (e.g., `import { usersServices } from "./users.service.js"`).
- **Framework:** Express 5 (`express@5.1.0`). Rejected promises from `async` route handlers automatically forward to `globalErrorHandler`—do not wrap handlers in a manual `catchAsync` helper.
- **Database & ORM:** PostgreSQL with **Prisma 8 RC** (`@prisma/orm-postgres` + `@prisma/cli-engine`).
  - Schema lives at `src/prisma/contract.prisma` (starts with `// use prisma-8`).
  - Uses Prisma 8 directives (`@onCreate(uuid())`, `@onUpdate(now())`), not legacy `@default(uuid())` / `@updatedAt`.
  - Database client singleton is `db` exported from `src/prisma/db.ts`.
  - **Never hand-edit** `src/prisma/contract.d.ts` or `src/prisma/contract.json`; regenerate them via `bun run prisma:emit`.

## Verified Commands

| Task | Command |
| :--- | :--- |
| Start dev server (watch) | `bun run dev` |
| Typecheck | `bunx tsc --noEmit` |
| Emit Prisma contract | `bun run prisma:emit` |
| Plan DB migration | `bun run prisma:migrate-plan <migration_name>` |
| Apply DB migration | `bun run prisma:migrate` |

## Directory Structure & Conventions

```text
src/
├── app.ts                      # Express app setup, /api/v1/ mount, globalErrorHandler
├── server.ts                   # Entrypoint (starts HTTP listener)
├── configs/env-configs.ts      # Centralized dotenv configuration
├── middlewares/                # Express middlewares (global-error-handler.ts)
├── modules/<feature>/          # Feature modules (route, controller, service, interface)
├── prisma/                     # contract.prisma, db.ts, and generated contract.{d.ts,json}
├── routes/index.ts             # Central router mounting all feature modules
└── utilities/                  # Shared helpers (app-error.ts, send-response.ts)
```

- **File Naming:**
  - Feature modules: `src/modules/<plural-feature>/<plural-feature>.{route,controller,service,interface}.ts`
  - Shared files (`configs/`, `middlewares/`, `utilities/`): `kebab-case.ts`
- **Layering:**
  - `*.route.ts`: Declares Express `Router` endpoints and exports default router. Registered in `src/routes/index.ts` under `moduleRoutes`.
  - `*.controller.ts`: Parses request, calls service, responds via `sendResponse` + `http-status`. Exports a grouped object (`export const <feature>Controllers = { ... }`).
  - `*.service.ts`: Holds business logic and Prisma `db` calls. Exports a grouped object (`export const <feature>Services = { ... }`).
  - `*.interface.ts`: Feature-specific TypeScript types and interfaces.
- **Responses & Errors:**
  - Always return success payloads through `sendResponse(res, { statusCode, success: true, message, data })` using `http-status` constants.
  - Always throw `AppError` (from `src/utilities/app-error.ts`) for expected operational errors (`notFound`, `badRequest`, `unauthorized`, `forbidden`, `conflict`, `internal`). Never send ad-hoc error JSON directly from controllers or services.

## Non-Negotiable Guardrails

1. **Multi-Tenant Isolation:** Every tenant-owned model must reference `tenantId`, and every query/mutation on tenant data must explicitly scope by `tenantId`. Never allow cross-tenant reads or writes.
2. **Sensitive Data:** Never return `password` hashes or secrets in API responses or logs.
3. **Environment & Secrets:** Never read, print, or commit `.env`. Document any new environment variables in `.env.example` and expose them via `src/configs/env-configs.ts`.
4. **Database Safety:** Never run destructive database resets or apply migrations containing `DROP` statements without explicit user confirmation.
5. **Generated Files:** Never manually edit `src/prisma/contract.d.ts`, `src/prisma/contract.json`, or files under `migrations/`.

## Available Project Skills

Use the project skills in `.agents/skills/` for repeatable workflows:

- `prisma-v8-workflow` — Editing `src/prisma/contract.prisma`, emitting contracts, and planning/applying migrations.
- `create-feature-module` — Scaffolding and wiring a new feature module under `src/modules/`.
