import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import envConfigs from "../../configs/env-configs.js";
import { db } from "../../db/index.js";
import * as schema from "../../db/schema/index.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const auth = betterAuth({
  secret: envConfigs.betterAuthSecret,
  baseURL: envConfigs.betterAuthUrl,
  trustedOrigins: [envConfigs.clientUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      tenantId: {
        type: "string",
        required: true,
        input: true,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false,
      },
      isActive: {
        type: "string",
        required: false,
        defaultValue: "active",
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const tenantId = (user as Record<string, unknown>).tenantId;

          if (typeof tenantId !== "string" || !UUID_REGEX.test(tenantId)) {
            throw new APIError("BAD_REQUEST", {
              message: "A valid tenantId is required. Create a tenant first.",
            });
          }

          const [tenant] = await db
            .select()
            .from(schema.tenants)
            .where(eq(schema.tenants.id, tenantId))
            .limit(1);

          if (!tenant) {
            throw new APIError("NOT_FOUND", {
              message: "Tenant not found. Create a tenant first.",
            });
          }

          if (tenant.status !== "active") {
            throw new APIError("FORBIDDEN", {
              message: `Cannot register users under a ${tenant.status} tenant.`,
            });
          }

          const [existingOwner] = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
              and(
                eq(schema.users.tenantId, tenantId),
                eq(schema.users.role, "owner"),
              ),
            )
            .limit(1);

          return {
            data: {
              ...user,
              role: existingOwner ? "customer" : "owner",
            },
          };
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});

export type BetterAuthInstance = typeof auth;
