import { and, eq, ne } from "drizzle-orm";
import status from "http-status";
import { db } from "../../db/index.js";
import { tenants, tenantStatusEnum } from "../../db/schema/index.js";
import AppError from "../../utilities/app-error.js";
import type { UserRole } from "../auth/auth.interface.js";
import type { CreateTenantPayload, TenantStatus, UpdateTenantPayload } from "./tenants.interface.js";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const normalizeSlug = (value: string): string => {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
};

const createTenant = async (payload: CreateTenantPayload) => {
	const name = payload?.name?.trim();
	if (!name) {
		throw new AppError({
			statusCode: status.BAD_REQUEST,
			message: "Tenant name is required.",
			code: "VALIDATION_ERROR",
		});
	}

	const slug = normalizeSlug(payload.slug ?? name);
	if (slug.length < 2 || slug.length > 100 || !SLUG_REGEX.test(slug)) {
		throw new AppError({
			statusCode: status.BAD_REQUEST,
			message: "Tenant slug must be 2–100 lowercase alphanumeric characters or hyphens.",
			code: "VALIDATION_ERROR",
		});
	}

	const [existing] = await db
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);

	if (existing) {
		throw AppError.conflict(`A tenant with slug "${slug}" already exists.`);
	}

	const [created] = await db
		.insert(tenants)
		.values({
			name,
			slug,
		})
		.returning();

	return created;
};

const getTenantBySlug = async (rawSlug: string) => {
	const slug = normalizeSlug(rawSlug || "");
	if (!slug) {
		throw AppError.badRequest("A valid tenant slug is required.");
	}

	const [tenant] = await db
		.select({
			id: tenants.id,
			name: tenants.name,
			slug: tenants.slug,
			status: tenants.status,
			createdAt: tenants.createdAt,
		})
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);

	if (!tenant) {
		throw AppError.notFound("Tenant not found.");
	}

	return tenant;
};

const getTenantById = async (tenantId: string) => {
	const [tenant] = await db
		.select()
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.limit(1);

	if (!tenant) {
		throw AppError.notFound("Tenant not found.");
	}

	return tenant;
};

const updateTenant = async (
	tenantId: string,
	actorRole: UserRole,
	payload: UpdateTenantPayload,
) => {
	const updates: Partial<{ name: string; slug: string; status: TenantStatus }> = {};

	if (payload.name !== undefined) {
		const trimmed = payload.name.trim();
		if (!trimmed) {
			throw AppError.badRequest("Tenant name cannot be empty.");
		}
		updates.name = trimmed;
	}

	if (payload.slug !== undefined) {
		const slug = normalizeSlug(payload.slug);
		if (slug.length < 2 || slug.length > 100 || !SLUG_REGEX.test(slug)) {
			throw AppError.badRequest(
				"Tenant slug must be 2–100 lowercase alphanumeric characters or hyphens.",
			);
		}

		const [conflict] = await db
			.select({ id: tenants.id })
			.from(tenants)
			.where(and(eq(tenants.slug, slug), ne(tenants.id, tenantId)))
			.limit(1);

		if (conflict) {
			throw AppError.conflict(`A tenant with slug "${slug}" already exists.`);
		}

		updates.slug = slug;
	}

	if (payload.status !== undefined) {
		if (actorRole !== "owner") {
			throw AppError.forbidden("Only a tenant owner can change tenant status.");
		}

		if (!tenantStatusEnum.enumValues.includes(payload.status)) {
			throw AppError.badRequest(
				`Invalid status. Allowed values: ${tenantStatusEnum.enumValues.join(", ")}.`,
			);
		}

		updates.status = payload.status;
	}

	if (Object.keys(updates).length === 0) {
		throw AppError.badRequest("No valid fields provided for update.");
	}

	const [updated] = await db
		.update(tenants)
		.set(updates)
		.where(eq(tenants.id, tenantId))
		.returning();

	if (!updated) {
		throw AppError.notFound("Tenant not found.");
	}

	return updated;
};

export const tenantsServices = {
	createTenant,
	getTenantBySlug,
	getTenantById,
	updateTenant,
};
