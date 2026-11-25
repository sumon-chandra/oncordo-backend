import dotenv from "dotenv";
import path from "path";

if (!process.env.VERCEL) {
	dotenv.config({
		path: path.join(process.cwd(), ".env"),
	});
}

const vercelFallbackUrl = process.env.VERCEL_URL
	? `https://${process.env.VERCEL_URL}`
	: "http://localhost:3000";

const envConfigs = {
	port: process.env.PORT || 3000,
	nodeEnv: process.env.NODE_ENV || "development",
	databaseUrl: process.env.DATABASE_URL || "",
	betterAuthSecret: process.env.BETTER_AUTH_SECRET || "",
	betterAuthUrl: process.env.BETTER_AUTH_URL || vercelFallbackUrl,
	clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
};

export default envConfigs;
