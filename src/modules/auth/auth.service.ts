import type { IncomingHttpHeaders } from "node:http";
import status from "http-status";
import { isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import AppError, { type ErrorCode } from "../../utilities/app-error.js";
import { auth } from "./auth.config.js";
import type { LoginPayload, RegisterPayload } from "./auth.interface.js";

const toAppError = (err: unknown): never => {
  if (isAPIError(err)) {
    const statusCode =
      typeof err.statusCode === "number" ? err.statusCode : status.BAD_REQUEST;

    let code: ErrorCode = "AUTH_FAILED";
    if (
      statusCode === status.CONFLICT ||
      statusCode === status.UNPROCESSABLE_ENTITY
    ) {
      code = "EMAIL_CONFLICT";
    } else if (statusCode === status.NOT_FOUND) {
      code = "NOT_FOUND";
    } else if (statusCode === status.UNAUTHORIZED) {
      code = "UNAUTHORIZED";
    } else if (statusCode === status.FORBIDDEN) {
      code = "FORBIDDEN";
    } else if (statusCode === status.BAD_REQUEST) {
      code = "VALIDATION_ERROR";
    }

    throw new AppError({
      statusCode,
      message: err.message || "Authentication failed.",
      code,
    });
  }

  throw err;
};

const register = async (
  payload: RegisterPayload,
  reqHeaders: IncomingHttpHeaders,
) => {
  if (!payload?.name || !payload?.email || !payload?.password || !payload?.tenantId) {
    throw new AppError({
      statusCode: status.BAD_REQUEST,
      message: "name, email, password, and tenantId are required. Create a tenant first.",
      code: "VALIDATION_ERROR",
    });
  }

  try {
    return await auth.api.signUpEmail({
      body: {
        name: payload.name,
        email: payload.email,
        password: payload.password,
        image: payload.image,
        tenantId: payload.tenantId,
        callbackURL: payload.callbackURL,
      },
      headers: fromNodeHeaders(reqHeaders),
      returnHeaders: true,
    });
  } catch (err) {
    return toAppError(err);
  }
};

const login = async (
  payload: LoginPayload,
  reqHeaders: IncomingHttpHeaders,
) => {
  if (!payload?.email || !payload?.password) {
    throw new AppError({
      statusCode: status.BAD_REQUEST,
      message: "email and password are required.",
      code: "VALIDATION_ERROR",
    });
  }

  try {
    return await auth.api.signInEmail({
      body: {
        email: payload.email,
        password: payload.password,
        rememberMe: payload.rememberMe,
        callbackURL: payload.callbackURL,
      },
      headers: fromNodeHeaders(reqHeaders),
      returnHeaders: true,
    });
  } catch (err) {
    return toAppError(err);
  }
};

const logout = async (reqHeaders: IncomingHttpHeaders) => {
  try {
    return await auth.api.signOut({
      headers: fromNodeHeaders(reqHeaders),
      returnHeaders: true,
    });
  } catch (err) {
    return toAppError(err);
  }
};

const getCurrentSession = async (reqHeaders: IncomingHttpHeaders) => {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(reqHeaders),
  });

  if (!result) {
    throw AppError.unauthorized("Authentication required.");
  }

  return result;
};

export const authServices = {
  register,
  login,
  logout,
  getCurrentSession,
};
