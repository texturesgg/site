import { ac, roles, type UserRole } from "@vgskins/shared/permissions";
import {
  adminClient,
  deviceAuthorizationClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_BASE_URL } from "./config";

export const EMAIL_PASSWORD_AUTH_ENABLED =
  import.meta.env.VITE_ENABLE_EMAIL_PASSWORD_AUTH !== "false";

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: "/api/auth",
  plugins: [
    adminClient({ ac, roles }),
    deviceAuthorizationClient(),
    inferAdditionalFields({
      user: {
        role: {
          type: "string",
          required: false,
        },
      },
    }),
  ],
});

// Re-export UserRole for convenience
export type { UserRole };

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
