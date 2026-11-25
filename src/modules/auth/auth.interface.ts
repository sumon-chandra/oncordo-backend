import type { tenants, userRole } from "../../db/schema/index.js";
import type { auth } from "./auth.config.js";

export type AuthSessionData = typeof auth.$Infer.Session;
export type AuthUser = AuthSessionData["user"];
export type AuthSession = AuthSessionData["session"];
export type UserRole = (typeof userRole.enumValues)[number];
export type TenantRecord = typeof tenants.$inferSelect;

export interface RegisterPayload {
	name: string;
	email: string;
	password: string;
	tenantId: string;
	image?: string;
	callbackURL?: string;
}

export interface LoginPayload {
	email: string;
	password: string;
	rememberMe?: boolean;
	callbackURL?: string;
}

declare global {
	namespace Express {
		interface Request {
			user?: AuthUser;
			session?: AuthSession;
			tenant?: TenantRecord;
		}
	}
}
