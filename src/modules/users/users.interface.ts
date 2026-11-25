import type { userRole, users } from "../../db/schema/index.js";

export type UserRole = (typeof userRole.enumValues)[number];
export type UserDto = typeof users.$inferSelect;

export interface UpdateUserRolePayload {
	role: UserRole;
}
