import { Router } from "express";
import authRoute from "../modules/auth/auth.route.js";
import tenantsRoute from "../modules/tenants/tenants.route.js";
import usersRoute from "../modules/users/users.route.js";

const mainRouter = Router();

const moduleRoutes = [
	{
		path: "/tenants",
		route: tenantsRoute,
	},
	{
		path: "/auth",
		route: authRoute,
	},
	{
		path: "/users",
		route: usersRoute,
	},
];

moduleRoutes.forEach((route) => {
	mainRouter.use(route.path, route.route);
});

export default mainRouter;
