import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { createId } from "@paralleldrive/cuid2";
import { checkout, polar, portal } from "@polar-sh/better-auth";
import type { Database } from "@savo/db";
import * as schema from "@savo/db/schema/auth";
import { betterAuth } from "better-auth";

import { createPolarClient } from "./lib/payments";

export type AuthConfig = {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	POLAR_ACCESS_TOKEN: string;
	POLAR_SUCCESS_URL: string;
};

export function createAuth(
	env: AuthConfig,
	database: Database,
	desktopOrigins: readonly string[] = [],
) {
	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
		emailAndPassword: { enabled: true },
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
			database: {
				generateId: () => createId(),
			},
		},
		plugins: [
			polar({
				client: createPolarClient(env),
				createCustomerOnSignUp: true,
				use: [
					checkout({
						products: [{ productId: "your-product-id", slug: "pro" }],
						successUrl: env.POLAR_SUCCESS_URL,
						authenticatedUsersOnly: true,
					}),
					portal(),
				],
			}),
		],
	});
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
