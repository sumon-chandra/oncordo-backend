---
name: create-feature-module
description: >-
  Use this skill when creating a new backend feature module or adding endpoints
  under src/modules/ in oncordo-server (routes, controllers, services, interfaces,
  and router registration).
---

# Create a Feature Module

Follow this procedure when adding a new domain module (e.g., `bookings`, `visits`, `resources`, `courses`) so it matches the existing `src/modules/users/` architecture.

## Target File Structure

Use plural kebab-case for the module folder and file prefix:

```text
src/modules/<feature>/
├── <feature>.interface.ts
├── <feature>.service.ts
├── <feature>.controller.ts
└── <feature>.route.ts
```

## Steps

1. **Define types (`<feature>.interface.ts`)**
   - Declare request payload types, filter types, and safe response DTOs.
   - Omit sensitive fields (such as `password`) from response types.

2. **Implement business logic (`<feature>.service.ts`)**
   - Import the Prisma client singleton via `import { db } from "../../prisma/db.js";`.
   - Enforce multi-tenant isolation: require and filter by `tenantId` on every tenant-scoped read, update, and delete.
   - Throw `AppError` (from `../../utilities/app-error.js`) for missing records, conflicts, or invalid state transitions.
   - Export a grouped object:
     ```ts
     export const <feature>Services = {
       // methods...
     };
     ```

3. **Implement HTTP handlers (`<feature>.controller.ts`)**
   - Write `async (req: Request, res: Response)` handlers. Because the project uses Express 5, rejected promises automatically route to `globalErrorHandler`.
   - Keep controllers thin: extract params/query/body, delegate to `<feature>Services`, and respond using `sendResponse` + `http-status`:
     ```ts
     import type { Request, Response } from "express";
     import status from "http-status";
     import sendResponse from "../../utilities/send-response.js";
     import { <feature>Services } from "./<feature>.service.js";

     const getAll = async (req: Request, res: Response) => {
       const data = await <feature>Services.getAll();

       sendResponse(res, {
         statusCode: status.OK,
         success: true,
         message: "<Feature> retrieved successfully.",
         data,
       });
     };

     export const <feature>Controllers = {
       getAll,
     };
     ```

4. **Define routes (`<feature>.route.ts`)**
   - Create an Express `Router()`, bind controller methods, and default-export the router:
     ```ts
     import { Router } from "express";
     import { <feature>Controllers } from "./<feature>.controller.js";

     const <feature>Route = Router();

     <feature>Route.get("/", <feature>Controllers.getAll);

     export default <feature>Route;
     ```

5. **Register the module in `src/routes/index.ts`**
   - Import `<feature>Route` with the `.js` extension and add `{ path: "/<feature>", route: <feature>Route }` to `moduleRoutes`.
   - All routes in `src/routes/index.ts` are automatically mounted under `/api/v1/`.

## Verification

- Confirm every relative import in the new files ends with `.js`.
- Run `bunx tsc --noEmit` and confirm zero TypeScript errors.
- Confirm all tenant-scoped queries filter by `tenantId` and no sensitive fields are exposed in responses.

