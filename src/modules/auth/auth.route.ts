import { Router } from "express";
import { authControllers } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

const authRoute = Router();

authRoute.post("/register", authControllers.register);
authRoute.post("/login", authControllers.login);
authRoute.post("/logout", requireAuth, authControllers.logout);
authRoute.get("/me", requireAuth, authControllers.getMe);

export default authRoute;
