import { Router } from "express";
import { requireAuth, requireRole, requireTenant } from "../auth/auth.middleware.js";
import { tenantsControllers } from "./tenants.controller.js";

const tenantsRoute = Router();

// Step 1 of onboarding: create a tenant first before registering users or running operations
tenantsRoute.post("/", tenantsControllers.createTenant);

// Public lookup so clients can resolve tenantId from a URL slug before login/registration
tenantsRoute.get("/slug/:slug", tenantsControllers.getTenantBySlug);

// Authenticated tenant workspace endpoints
tenantsRoute.get("/me", requireAuth, requireTenant, tenantsControllers.getMyTenant);
tenantsRoute.patch(
	"/me",
	requireAuth,
	requireTenant,
	requireRole("owner", "admin"),
	tenantsControllers.updateMyTenant,
);

export default tenantsRoute;
