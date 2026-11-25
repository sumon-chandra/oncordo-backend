import type { Request, Response } from "express";
import status from "http-status";
import AppError from "../../utilities/app-error.js";
import sendResponse from "../../utilities/send-response.js";
import { authServices } from "./auth.service.js";
import "./auth.interface.js";

const forwardAuthCookies = (headers: Headers, res: Response) => {
	const cookies = headers.getSetCookie();
	if (cookies.length > 0) {
		res.setHeader("set-cookie", cookies);
	}
};

const register = async (req: Request, res: Response) => {
	const { headers, response } = await authServices.register(req.body, req.headers);

	forwardAuthCookies(headers, res);

	sendResponse(res, {
		statusCode: status.CREATED,
		success: true,
		message: "User registered successfully.",
		data: response,
	});
};

const login = async (req: Request, res: Response) => {
	const { headers, response } = await authServices.login(req.body, req.headers);

	forwardAuthCookies(headers, res);

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "Logged in successfully.",
		data: response,
	});
};

const logout = async (req: Request, res: Response) => {
	const { headers, response } = await authServices.logout(req.headers);

	forwardAuthCookies(headers, res);

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "Logged out successfully.",
		data: response,
	});
};

const getMe = async (req: Request, res: Response) => {
	if (!req.user || !req.session) {
		throw AppError.unauthorized("Authentication required.");
	}

	sendResponse(res, {
		statusCode: status.OK,
		success: true,
		message: "Authenticated user retrieved successfully.",
		data: {
			user: req.user,
			session: req.session,
		},
	});
};

export const authControllers = {
	register,
	login,
	logout,
	getMe,
};
