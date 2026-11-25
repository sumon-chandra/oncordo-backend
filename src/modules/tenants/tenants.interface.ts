import type { tenants, tenantStatusEnum } from "../../db/schema/index.js";

export type TenantStatus = (typeof tenantStatusEnum.enumValues)[number];
export type Tenant = typeof tenants.$inferSelect;

export interface CreateTenantPayload {
	name: string;
	slug?: string;
}

export interface UpdateTenantPayload {
	name?: string;
	slug?: string;
	status?: TenantStatus;
}
