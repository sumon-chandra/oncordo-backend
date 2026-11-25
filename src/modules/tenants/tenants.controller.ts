import type { Request, Response } from "express";
import status from "http-status";
import sendResponse from "../../utilities/send-response.js";
import type { UserRole } from "../auth/auth.interface.js";
import { tenantsServices } from "./tenants.service.js";

const createTenant = async (req: Request, res: Response) => {
	const data = await tenantsServices.createTenant(req.body);

	sendResponse(res, {
		statusCode: status.CREATED,
		success: true,
		message: "Tenant created successfully.",
		data,
	});
};

const getTenantBySlug = async (req: Request, res: Response) => {
	const data = await tenantsServices.getTenantBySlug(req.params.slug as string);

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "Tenant retrieved successfully.",
		data,
	});
};

const getMyTenant = async (req: Request, res: Response) => {
	const data = req.tenant ?? (await tenantsServices.getTenantById(req.user!.tenantId));

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "Tenant retrieved successfully.",
		data,
	});
};

const updateMyTenant = async (req: Request, res: Response) => {
	const data = await tenantsServices.updateTenant(
		req.user!.tenantId,
		req.user!.role as UserRole,
		req.body,
	);

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "Tenant updated successfully.",
		data,
	});
};

export const tenantsControllers = {
	createTenant,
	getTenantBySlug,
	getMyTenant,
	updateMyTenant,
};
