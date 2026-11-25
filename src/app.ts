import cors from "cors";
import express, { Request, Response } from "express";
import { toNodeHandler } from "better-auth/node";
import envConfigs from "./configs/env-configs.js";
import globalErrorHandler from "./middlewares/global-error-handler.js";
import { auth } from "./modules/auth/auth.config.js";
import mainRouter from "./routes/index.js";

const app = express();

app.use(
	cors({
		origin: envConfigs.clientUrl,
		credentials: true,
	}),
);

// Mount Better Auth handler BEFORE express.json() so it can read the raw request stream
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req: Request, res: Response) => {
	res.status(200).json({
		success: true,
		message: "Welcome to the server.",
	});
});

app.use("/api/v1/", mainRouter);
app.use(globalErrorHandler);

export default app;
