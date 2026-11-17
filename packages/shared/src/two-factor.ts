import { z } from "zod";

/** The code a moderator or admin action answers with when the session hasn't
 * proved two-factor sign-in. */
export const TWO_FACTOR_REQUIRED_CODE = "two_factor_required";

/** That answer's body. */
export const twoFactorRefusalSchema = z.object({
  error: z.string(),
  code: z.literal(TWO_FACTOR_REQUIRED_CODE),
});
export type TwoFactorRefusal = z.infer<typeof twoFactorRefusalSchema>;
