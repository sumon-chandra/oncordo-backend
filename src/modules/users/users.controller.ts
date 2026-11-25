import type { Request, Response } from "express";
import status from "http-status";
import sendResponse from "../../utilities/send-response.js";
import type { UserRole } from "./users.interface.js";
import { usersServices } from "./users.service.js";

const getAllUsers = async (req: Request, res: Response) => {
	const data = await usersServices.getAllUsers(req.user!.tenantId);

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "Users retrieved successfully.",
		data,
	});
};

const getUserById = async (req: Request, res: Response) => {
	const data = await usersServices.getUserById(req.user!.tenantId, req.params.id as string);

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "User retrieved successfully.",
		data,
	});
};

const updateUserRole = async (req: Request, res: Response) => {
	const data = await usersServices.updateUserRole(
		req.user!.tenantId,
		req.user!.role as UserRole,
		req.params.id as string,
		req.body,
	);

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "User role updated successfully.",
		data,
	});
};

export const usersControllers = {
	getAllUsers,
	getUserById,
	updateUserRole,
};
