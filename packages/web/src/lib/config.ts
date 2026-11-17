export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";
export const ASSETS_URL =
  import.meta.env.VITE_ASSETS_URL ||
  (import.meta.env.PROD ? "https://assets.textures.gg" : `${API_BASE_URL}/api/files`);

/** The community Discord, linked from the footer, About, and Download. */
export const DISCORD_URL = "https://discord.gg/RzFFFg3J4g";

/** The GitHub organization with the site, the app, and its crates. */
export const GITHUB_URL = "https://github.com/texturesgg";

/** The meeting point: matchmaking, and the queue list Explore shows. */
export const MEET_URL = import.meta.env.VITE_MEET_URL || "https://meet.textures.gg";

/** Where reports and takedowns go. */
export const CONTACT_EMAIL = "contact@textures.gg";
