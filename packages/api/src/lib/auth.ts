import { createDb, schema } from "@vgskins/db";
import { ac, roles, type UserRole } from "@vgskins/shared/permissions";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { and, eq, gt, like } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Env, HonoEnv } from "../types";
import { authPolicy } from "./auth-policy";
import {
  resetPasswordEmailHtml,
  sendEmail,
  setPasswordEmailHtml,
  verificationEmailHtml,
} from "./email";
import { uniqueUsername } from "./username";

/** The site origins the API trusts for CORS and auth; localhost only in development. */
export function siteOrigins(env: Pick<Env, "ENVIRONMENT" | "SITE_BASE_URL">): string[] {
  const deployed = ["https://textures.gg", "https://www.textures.gg", env.SITE_BASE_URL];
  const local = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"];
  return env.ENVIRONMENT === "development" ? [...deployed, ...local] : deployed;
}

// A sign-up attempt for an existing account emails a reset link at most this often.
const EXISTING_USER_EMAIL_COOLDOWN_MS = 5 * 60 * 1000;

// Create better-auth instance from request-time env
function createAuth(env: Env) {
  const db = createDb(env.DB);
  // Assigned once the instance exists; the hook below runs only at request time.
  let requestPasswordReset: (email: string) => Promise<unknown> = async () => {};

  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        ...schema,
        user: schema.users,
        account: schema.accounts,
        session: schema.sessions,
        verification: schema.verifications,
      },
    }),

    basePath: "/api/auth",
    baseURL: env.API_BASE_URL,
    trustedOrigins: siteOrigins(env),

    secret: env.BETTER_AUTH_SECRET,

    emailAndPassword: {
      enabled: env.ENVIRONMENT !== "preview",
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        const credential = await db.query.accounts.findFirst({
          where: and(
            eq(schema.accounts.userId, user.id),
            eq(schema.accounts.providerId, "credential")
          ),
          columns: { id: true },
        });
        await sendEmail(
          env.EMAIL,
          credential
            ? {
                to: user.email,
                subject: "Reset your password — textures.gg",
                html: resetPasswordEmailHtml(url),
              }
            : {
                to: user.email,
                subject: "Set your password — textures.gg",
                html: setPasswordEmailHtml(url),
              }
        );
      },
      // The combined sign-in/sign-up form falls back to sign-up after a failed
      // sign-in. For an existing email, better-auth returns a generic success to
      // avoid revealing the account, so send a reset link to make "check your
      // email" true: it covers a mistyped password and claiming an imported or
      // OAuth-only account.
      onExistingUserSignUp: async ({ user }) => {
        const recent = await db.query.verifications.findFirst({
          where: and(
            eq(schema.verifications.value, user.id),
            like(schema.verifications.identifier, "reset-password:%"),
            gt(
              schema.verifications.createdAt,
              new Date(Date.now() - EXISTING_USER_EMAIL_COOLDOWN_MS)
            )
          ),
          columns: { id: true },
        });
        if (recent) return;
        await requestPasswordReset(user.email);
      },
      // Following an emailed reset link proves ownership of the address.
      onPasswordReset: async ({ user }) => {
        if (user.emailVerified) return;
        await db
          .update(schema.users)
          .set({ emailVerified: true, updatedAt: new Date() })
          .where(eq(schema.users.id, user.id));
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      // An unverified account that signs in with the right password gets a fresh link.
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env.EMAIL, {
          to: user.email,
          subject: "Verify your email — textures.gg",
          html: verificationEmailHtml(url),
        });
      },
    },

    socialProviders: {
      discord: {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      twitter: {
        clientId: env.TWITTER_CLIENT_ID,
        clientSecret: env.TWITTER_CLIENT_SECRET,
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        // A trusted provider links to the account holding its email without
        // the provider having verified that email. Discord reports addresses
        // it has not verified, so it is left out: a Discord account links only
        // once Discord has verified its email.
        trustedProviders: ["google", "github", "twitter", "credential"],
      },
    },

    hooks: { before: authPolicy(db) },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              name: await uniqueUsername(user.name || user.email.split("@")[0], async (name) =>
                Boolean(
                  await db.query.users.findFirst({
                    where: eq(schema.users.name, name),
                    columns: { id: true },
                  })
                )
              ),
            },
          }),
        },
      },
    },

    plugins: [
      admin({
        ac,
        roles,
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
    ],

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every day
    },
  });

  requestPasswordReset = (email) =>
    auth.api.requestPasswordReset({
      body: { email, redirectTo: `${env.SITE_BASE_URL}/reset-password` },
    });

  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

// User type returned by auth middleware
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  [key: string]: unknown;
};

// Cache auth instances per environment to avoid re-creating on every request
let cachedAuth: ReturnType<typeof createAuth> | null = null;
let cachedEnvId: string | null = null;

function getAuth(env: Env) {
  const envId = env.ENVIRONMENT ?? "development";
  if (cachedAuth && cachedEnvId === envId) {
    return cachedAuth;
  }
  cachedAuth = createAuth(env);
  cachedEnvId = envId;
  return cachedAuth;
}

// Export auth handler for mounting better-auth routes
export const authHandler = createMiddleware<HonoEnv>(async (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});

// Handlers after requireAuth see a non-null user.
type AuthenticatedEnv = {
  Bindings: HonoEnv["Bindings"];
  Variables: { user: AuthUser; session: unknown };
};

// better-auth refuses a banned user only when a session is created, so a
// session that already exists is checked against the ban on every request.
async function signedIn(env: Env, headers: Headers) {
  const session = await getAuth(env).api.getSession({ headers });
  if (!session) return null;
  const { banned, banExpires } = session.user;
  if (banned && (!banExpires || banExpires.getTime() > Date.now())) return null;
  const user: AuthUser = {
    ...session.user,
    role: (session.user.role as UserRole) || "user",
  };
  return { user, session: session.session };
}

// Required auth middleware - returns 401 if not authenticated
export const requireAuth = createMiddleware<AuthenticatedEnv>(async (c, next) => {
  const current = await signedIn(c.env, c.req.raw.headers);
  if (!current) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", current.user);
  c.set("session", current.session);
  await next();
});

// Optional auth middleware - resolves user if authenticated, null otherwise
export const optionalAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const current = await signedIn(c.env, c.req.raw.headers);
  c.set("user", current?.user ?? null);
  await next();
});

// ============================================================================
// Role Guards (middleware - use after requireAuth)
// ============================================================================

/** Returns 403 unless the signed-in user is a moderator or admin. */
export const requireModerator = createMiddleware<AuthenticatedEnv>(async (c, next) => {
  if (!isModerator(c.get("user"))) {
    return c.json({ error: "Moderator access required" }, 403);
  }
  await next();
});

/** Returns 403 unless the signed-in user is an admin. */
export const requireAdmin = createMiddleware<AuthenticatedEnv>(async (c, next) => {
  if (!isAdmin(c.get("user"))) {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
});

// ============================================================================
// Role Checks (return boolean - use for conditional logic)
// ============================================================================

export function isModerator(user: { role?: string } | null | undefined): boolean {
  return user?.role === "moderator" || user?.role === "admin";
}

export function isAdmin(user: { role?: string } | null | undefined): boolean {
  return user?.role === "admin";
}
