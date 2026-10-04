import { relations } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================================
// Auth tables (better-auth compatible)
// ============================================================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  email: text("email").unique().notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  role: text("role", { enum: ["user", "moderator", "admin"] })
    .default("user")
    .notNull(),
  // Admin plugin fields (ban support)
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
  // Creator profile fields
  bio: text("bio"),
  pronouns: text("pronouns"),
  showDiscord: integer("show_discord", { mode: "boolean" }).default(false),
  showTwitter: integer("show_twitter", { mode: "boolean" }).default(false),
  showGithub: integer("show_github", { mode: "boolean" }).default(false),
  twitterHandle: text("twitter_handle"),
  githubUsername: text("github_username"),
  websiteUrl: text("website_url"),
  // Onboarding
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
    .default(false)
    .notNull(),
  // Import tracking
  // null = native, "ssbmtextures" = imported, "preview-sync" = copied into preview
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("provider_account_idx").on(table.providerId, table.accountId),
    index("account_user_idx").on(table.userId),
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("session_user_idx").on(table.userId)]
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

// A pending sign-in from the `tgg` command line (better-auth's device
// authorization). Approving it on the site turns it into a session.
export const deviceCodes = sqliteTable(
  "device_codes",
  {
    id: text("id").primaryKey(),
    deviceCode: text("device_code").notNull().unique(),
    userCode: text("user_code").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: integer("last_polled_at", { mode: "timestamp_ms" }),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (table) => [index("device_code_user_code_idx").on(table.userCode)]
);

// ============================================================================
// Game tables
// ============================================================================

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  shortName: text("short_name").notNull(),
  platform: text("platform"),
  iconKey: text("icon_key"),
  bannerKey: text("banner_key"),
  config: text("config", { mode: "json" }).$type<{
    modelPaths?: Record<string, string>;
    textureFormats?: string[];
    fileValidation?: {
      maxSize?: number;
      allowedExtensions?: string[];
    };
  }>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const targets = sqliteTable(
  "targets",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category", { enum: ["character", "stage", "ui", "audio"] }).notNull(),
    iconKey: text("icon_key"),
    modelKey: text("model_key"),
    nativeHsdAnimationKey: text("native_hsd_animation_key"),
    // Melee character file code, e.g. "Fx" in PlFxNr.dat. Null for non-characters.
    fileCode: text("file_code"),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [
    uniqueIndex("target_game_slug_idx").on(table.gameId, table.slug),
    index("target_game_idx").on(table.gameId),
  ]
);

// Color slots / costume slots per target (e.g. Fox -> Neutral, Red, Blue, Green)
export const targetSlots = sqliteTable(
  "target_slots",
  {
    id: text("id").primaryKey(),
    targetId: text("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "Neutral", "Red", "Blue", "Green"
    // Melee costume file code, e.g. "La" in PlFxLa.dat. Null when the slot has no
    // file of its own (stages, Mr. Game & Watch colors).
    fileCode: text("file_code"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("target_slot_name_idx").on(table.targetId, table.name),
    uniqueIndex("target_slot_order_idx").on(table.targetId, table.sortOrder),
    index("target_slot_target_idx").on(table.targetId),
  ]
);

// ============================================================================
// Pack & Mod tables
// ============================================================================

// A pack is the primary unit of content. Every upload creates a pack,
// even single-file uploads (a pack with 1 mod). Metadata, engagement,
// and moderation all live at the pack level.
export const packs = sqliteTable(
  "packs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    thumbnailKey: text("thumbnail_key"),
    status: text("status", {
      enum: ["processing", "pending", "approved", "rejected", "corrupted"],
    })
      .default("processing")
      .notNull(),
    expectedModCount: integer("expected_mod_count").default(0).notNull(),
    imageProcessingStatus: text("image_processing_status", {
      enum: ["pending", "processing", "succeeded", "failed", "skipped"],
    })
      .default("skipped")
      .notNull(),
    imageProcessingError: text("image_processing_error"),
    downloadCount: integer("download_count").default(0).notNull(),
    // Import tracking
    source: text("source"), // null = native, "ssbmtextures" = imported
    sourceId: text("source_id"), // original WP post ID for deduplication
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("pack_game_slug_idx").on(table.gameId, table.slug),
    index("pack_user_idx").on(table.userId),
    index("pack_target_idx").on(table.targetId),
    // Every public list filters on status and deleted_at and sorts by publish time.
    index("pack_status_published_idx").on(table.status, table.deletedAt, table.publishedAt),
  ]
);

// A mod is a single file within a pack. It represents one downloadable
// file mapped to a specific slot (costume color, stage variant, etc.).
export const mods = sqliteTable(
  "mods",
  {
    id: text("id").primaryKey(),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    slotId: text("slot_id")
      .notNull()
      .references(() => targetSlots.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(), // R2 storage key
    fileName: text("file_name").notNull(), // Original filename for downloads
    label: text("label"), // Optional display label (e.g. "Optional - Red Aura")
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    processingStatus: text("processing_status", {
      enum: ["queued", "processing", "succeeded", "failed"],
    })
      .default("succeeded")
      .notNull(),
    processingError: text("processing_error"),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("mod_pack_idx").on(table.packId), index("mod_slot_idx").on(table.slotId)]
);

export const packImages = sqliteTable(
  "pack_images",
  {
    id: text("id").primaryKey(),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull(),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [index("pack_images_pack_idx").on(table.packId)]
);

// ============================================================================
// Tag tables
// ============================================================================

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

export const packTags = sqliteTable(
  "pack_tags",
  {
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("pack_tag_idx").on(table.packId, table.tagId)]
);

// ============================================================================
// Collections
// ============================================================================

// Collections are user-curated groupings of packs
export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    thumbnailKey: text("thumbnail_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("collection_user_slug_idx").on(table.userId, table.slug),
    index("collection_user_idx").on(table.userId),
  ]
);

export const collectionItems = sqliteTable(
  "collection_items",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("collection_item_unique_idx").on(table.collectionId, table.packId),
    index("collection_item_collection_idx").on(table.collectionId),
  ]
);

// ============================================================================
// Engagement tables
// ============================================================================

export const votes = sqliteTable(
  "votes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    source: text("source"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("vote_user_pack_idx").on(table.userId, table.packId),
    index("vote_pack_idx").on(table.packId),
  ]
);

export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("favorite_user_pack_idx").on(table.userId, table.packId)]
);

export const downloads = sqliteTable(
  "downloads",
  {
    id: text("id").primaryKey(),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    downloadedAt: integer("downloaded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("download_pack_idx").on(table.packId),
    index("downloaded_at_idx").on(table.downloadedAt),
  ]
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // A reply's thread goes with the comment it answers.
    parentId: text("parent_id").references((): AnySQLiteColumn => comments.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    // Import tracking
    source: text("source"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("comments_pack_idx").on(table.packId),
    index("comments_user_idx").on(table.userId),
    index("comments_parent_idx").on(table.parentId),
  ]
);

// ============================================================================
// Reports
// ============================================================================

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Polymorphic target: "pack" or "comment"
    targetType: text("target_type", { enum: ["pack", "comment"] }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason", {
      enum: ["inappropriate", "stolen", "spam", "broken", "other"],
    }).notNull(),
    details: text("details"), // optional free-text
    status: text("status", { enum: ["pending", "resolved", "dismissed"] })
      .default("pending")
      .notNull(),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("report_status_idx").on(table.status),
    index("report_target_idx").on(table.targetType, table.targetId),
    index("report_reporter_idx").on(table.reporterId),
  ]
);

// ============================================================================
// Code mod tables
// ============================================================================

// A code mod: a hook-based mod for the textures.gg mod runtime (tgg/1). Its
// source lives in the Artifacts repo `mod-<id>`; versions are its releases.
export const codeMods = sqliteTable(
  "code_mods",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    // The manifest `id`, which names the installed folder: lowercase letters,
    // digits, `.`, `-`, `_`. Unique across the registry.
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    // Where releases come from: a public GitHub repo the sync worker mirrors, or
    // pushes straight to the Artifacts repo.
    sourceKind: text("source_kind", { enum: ["github", "push"] }).notNull(),
    sourceUrl: text("source_url"),
    downloadCount: integer("download_count").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("code_mod_user_idx").on(table.userId),
    index("code_mod_game_idx").on(table.gameId),
  ]
);

// One version of a code mod: a tag on its Artifacts repo, built once per game
// layout. Review covers the source at `commitSha`, so a later build of the same
// release for a new layout needs no new review.
export const codeModReleases = sqliteTable(
  "code_mod_releases",
  {
    id: text("id").primaryKey(),
    codeModId: text("code_mod_id")
      .notNull()
      .references(() => codeMods.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    tag: text("tag").notNull(),
    commitSha: text("commit_sha").notNull(),
    netplay: text("netplay", { enum: ["cosmetic", "gameplay"] }).notNull(),
    license: text("license"),
    status: text("status", {
      enum: ["processing", "pending", "approved", "rejected", "failed"],
    })
      .default("processing")
      .notNull(),
    // Why a failed release failed, such as a tag that doesn't match the
    // manifest's version or no build succeeding.
    error: text("error"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("code_mod_release_version_idx").on(table.codeModId, table.version),
    index("code_mod_release_status_idx").on(table.status, table.publishedAt),
  ]
);

// A game layout a port build exposes to mods (tgg/1 `game_abi`). A mod library
// loads only into a build with the same layout id, so the pipeline builds each
// release once per active layout, against that layout's game SDK and symbol
// list in the builder image. A retired layout gets no new builds, but its
// packages stay downloadable for players who haven't updated their port.
export const codeModLayouts = sqliteTable("code_mod_layouts", {
  // 16 hex digits, read from the port executable's `tgg_port` section.
  id: text("id").primaryKey(),
  api: text("api").notNull(), // e.g. "tgg/1"
  port: text("port").notNull(), // the port's name, e.g. "melee-pc"
  target: text("target").notNull(), // the target triple, e.g. "x86_64-linux-gnu"
  portVersion: text("port_version").notNull(), // the port build the SDK came from
  active: integer("active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

// A release built for one layout: the package players of that layout install.
export const codeModBuilds = sqliteTable(
  "code_mod_builds",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => codeModReleases.id, { onDelete: "cascade" }),
    layoutId: text("layout_id")
      .notNull()
      .references(() => codeModLayouts.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "building", "succeeded", "failed"] })
      .default("queued")
      .notNull(),
    runId: text("run_id"), // the build Workflow instance
    image: text("image"), // the builder image this build ran in, pinned by digest
    // The package zip in R2, keyed by its SHA-256, which identifies the build.
    packageKey: text("package_key"),
    packageSha256: text("package_sha256"),
    packageSize: integer("package_size"),
    // The packed manifest as read back from the package, including the hook
    // lists the packer took from the library.
    manifest: text("manifest", { mode: "json" }).$type<Record<string, unknown>>(),
    // The manifest's hooks under their canonical names (`name` for an exported
    // function, `file.c:name` for a static), checked against the layout's
    // symbols. Conflicts compare these, as the runtime does.
    canonicalHooks: text("canonical_hooks", { mode: "json" }).$type<{
      before?: string[];
      after?: string[];
      replaces?: string[];
    }>(),
    logKey: text("log_key"), // the compiler log in R2
    signature: text("signature"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("code_mod_build_release_layout_idx").on(table.releaseId, table.layoutId),
    index("code_mod_build_layout_idx").on(table.layoutId, table.status),
  ]
);

// ============================================================================
// Relations
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  packs: many(packs),
  codeMods: many(codeMods),
  collections: many(collections),
  votes: many(votes),
  favorites: many(favorites),
  comments: many(comments),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  targets: many(targets),
  packs: many(packs),
  codeMods: many(codeMods),
}));

export const targetsRelations = relations(targets, ({ one, many }) => ({
  game: one(games, { fields: [targets.gameId], references: [games.id] }),
  slots: many(targetSlots),
  packs: many(packs),
}));

export const targetSlotsRelations = relations(targetSlots, ({ one, many }) => ({
  target: one(targets, { fields: [targetSlots.targetId], references: [targets.id] }),
  mods: many(mods),
}));

export const packsRelations = relations(packs, ({ one, many }) => ({
  user: one(users, { fields: [packs.userId], references: [users.id] }),
  game: one(games, { fields: [packs.gameId], references: [games.id] }),
  target: one(targets, { fields: [packs.targetId], references: [targets.id] }),
  mods: many(mods),
  images: many(packImages),
  packTags: many(packTags),
  votes: many(votes),
  favorites: many(favorites),
  downloads: many(downloads),
  comments: many(comments),
}));

export const modsRelations = relations(mods, ({ one }) => ({
  pack: one(packs, { fields: [mods.packId], references: [packs.id] }),
  slot: one(targetSlots, { fields: [mods.slotId], references: [targetSlots.id] }),
}));

export const packImagesRelations = relations(packImages, ({ one }) => ({
  pack: one(packs, { fields: [packImages.packId], references: [packs.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  packTags: many(packTags),
}));

export const packTagsRelations = relations(packTags, ({ one }) => ({
  pack: one(packs, { fields: [packTags.packId], references: [packs.id] }),
  tag: one(tags, { fields: [packTags.tagId], references: [tags.id] }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, { fields: [collections.userId], references: [users.id] }),
  items: many(collectionItems),
}));

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionItems.collectionId],
    references: [collections.id],
  }),
  pack: one(packs, {
    fields: [collectionItems.packId],
    references: [packs.id],
  }),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  user: one(users, { fields: [votes.userId], references: [users.id] }),
  pack: one(packs, { fields: [votes.packId], references: [packs.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  pack: one(packs, { fields: [favorites.packId], references: [packs.id] }),
}));

export const downloadsRelations = relations(downloads, ({ one }) => ({
  pack: one(packs, { fields: [downloads.packId], references: [packs.id] }),
  user: one(users, { fields: [downloads.userId], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  pack: one(packs, { fields: [comments.packId], references: [packs.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  parent: one(comments, { fields: [comments.parentId], references: [comments.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, { fields: [reports.reporterId], references: [users.id] }),
  resolver: one(users, { fields: [reports.resolvedBy], references: [users.id] }),
}));

export const codeModsRelations = relations(codeMods, ({ one, many }) => ({
  user: one(users, { fields: [codeMods.userId], references: [users.id] }),
  game: one(games, { fields: [codeMods.gameId], references: [games.id] }),
  releases: many(codeModReleases),
}));

export const codeModReleasesRelations = relations(codeModReleases, ({ one, many }) => ({
  codeMod: one(codeMods, { fields: [codeModReleases.codeModId], references: [codeMods.id] }),
  reviewer: one(users, { fields: [codeModReleases.reviewedBy], references: [users.id] }),
  builds: many(codeModBuilds),
}));

export const codeModLayoutsRelations = relations(codeModLayouts, ({ many }) => ({
  builds: many(codeModBuilds),
}));

export const codeModBuildsRelations = relations(codeModBuilds, ({ one }) => ({
  release: one(codeModReleases, {
    fields: [codeModBuilds.releaseId],
    references: [codeModReleases.id],
  }),
  layout: one(codeModLayouts, {
    fields: [codeModBuilds.layoutId],
    references: [codeModLayouts.id],
  }),
}));
