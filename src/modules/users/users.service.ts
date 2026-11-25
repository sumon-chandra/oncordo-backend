import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { userRole, users } from "../../db/schema/index.js";
import AppError from "../../utilities/app-error.js";
import type { UpdateUserRolePayload, UserRole } from "./users.interface.js";

const getAllUsers = async (tenantId: string) => {
	return db
		.select()
		.from(users)
		.where(eq(users.tenantId, tenantId))
		.orderBy(asc(users.createdAt));
};

const getUserById = async (tenantId: string, userId: string) => {
	const [user] = await db
		.select()
		.from(users)
		.where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
		.limit(1);

	if (!user) {
		throw AppError.notFound("User not found in this tenant.");
	}

	return user;
};

const updateUserRole = async (
	tenantId: string,
	actorRole: UserRole,
	targetUserId: string,
	payload: UpdateUserRolePayload,
) => {
	if (!payload?.role || !userRole.enumValues.includes(payload.role)) {
		throw AppError.badRequest(
			`Invalid role. Allowed values: ${userRole.enumValues.join(", ")}.`,
		);
	}

	const targetUser = await getUserById(tenantId, targetUserId);

	if (
		actorRole !== "owner" &&
		(targetUser.role === "owner" ||
			targetUser.role === "admin" ||
			payload.role === "owner" ||
			payload.role === "admin")
	) {
		throw AppError.forbidden("Only a tenant owner can assign or modify owner/admin roles.");
	}

	if (targetUser.role === "owner" && payload.role !== "owner") {
		const activeOwners = await db
			.select({ id: users.id })
			.from(users)
			.where(
				and(
					eq(users.tenantId, tenantId),
					eq(users.role, "owner"),
					eq(users.isActive, "active"),
				),
			);

		if (activeOwners.length <= 1) {
			throw AppError.badRequest("Tenant must retain at least one active owner.");
		}
	}

	const [updated] = await db
		.update(users)
		.set({ role: payload.role })
		.where(and(eq(users.id, targetUserId), eq(users.tenantId, tenantId)))
		.returning();

	return updated;
};

export const usersServices = {
	getAllUsers,
	getUserById,
	updateUserRole,
};
