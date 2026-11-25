import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { db } from "../../db/index.js";
import { tenants } from "../../db/schema/index.js";
import AppError from "../../utilities/app-error.js";
import { auth } from "./auth.config.js";
import type { UserRole } from "./auth.interface.js";
import "./auth.interface.js";

export const attachSession = async (req: Request, res: Response, next: NextFunction) => {
	const result = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (result) {
		req.user = result.user;
		req.session = result.session;
	}

	next();
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
	const result = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (!result) {
		throw AppError.unauthorized("Authentication required.");
	}

	if (result.user.isActive && result.user.isActive !== "active") {
		throw AppError.forbidden("Your account is not active.");
	}

	req.user = result.user;
	req.session = result.session;
	next();
};

export const requireTenant = async (req: Request, res: Response, next: NextFunction) => {
	if (!req.user) {
		throw AppError.unauthorized("Authentication required.");
	}

	if (!req.user.tenantId) {
		throw AppError.forbidden("Tenant context is required.");
	}

	const [tenant] = await db
		.select()
		.from(tenants)
		.where(eq(tenants.id, req.user.tenantId))
		.limit(1);

	if (!tenant) {
		throw AppError.notFound("Tenant not found.");
	}

	if (tenant.status !== "active") {
		throw AppError.forbidden(`Tenant is currently ${tenant.status}.`);
	}

	req.tenant = tenant;
	next();
};

export const requireRole = (...allowedRoles: UserRole[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		if (!req.user) {
			throw AppError.unauthorized("Authentication required.");
		}

		const currentRole = req.user.role as UserRole | undefined;
		if (!currentRole || !allowedRoles.includes(currentRole)) {
			throw AppError.forbidden("You do not have permission to perform this action.");
		}

		next();
	};
};
