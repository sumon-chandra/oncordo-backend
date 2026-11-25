import { Router } from "express";
import { requireAuth, requireRole, requireTenant } from "../auth/auth.middleware.js";
import { usersControllers } from "./users.controller.js";

const usersRoute = Router();

usersRoute.use(requireAuth, requireTenant);

usersRoute.get("/", requireRole("owner", "admin", "staff"), usersControllers.getAllUsers);
usersRoute.get("/:id", requireRole("owner", "admin", "staff"), usersControllers.getUserById);
usersRoute.patch("/:id/role", requireRole("owner", "admin"), usersControllers.updateUserRole);

export default usersRoute;
