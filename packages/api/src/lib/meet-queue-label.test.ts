import { env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeMods,
  codeModSetMods,
  codeModSets,
  createDb,
  games,
} from "@vgskins/db";
import type { CodeModKind, CodeModNetplay } from "@vgskins/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { signIn } from "../test/session";
import { type LabelSet, parseNames, queueFor, queueInfo, standingQueues } from "./meet-queue-label";

const competitive: LabelSet = {
  title: "Competitive",
  mods: [
    { mod: "tgg.netplay", range: "^0.10", counted: true },
    { mod: "tgg.direct-connect", range: "^0.6", counted: true },
    { mod: "tgg.ucf", range: "^1.0", counted: true },
    { mod: "tgg.legal-stages", range: "^1.0", counted: false },
  ],
};
const names = new Map([
  ["me.volleyball", "Volleyball"],
  ["tgg.ucf", "UCF"],
]);
const base = "tgg.netplay 0.10.0, tgg.direct-connect 0.6.0, tgg.ucf 1.0.0";
/** The name a queue with these mods gets beside the Competitive set. */
const labelFor = (list: string) => queueFor(parseNames(list), [competitive], names).label;

describe("queue names", () => {
  it("reads tgg_mod_set_names", () => {
    expect(parseNames("a 1.0.0, b 2.1.0")).toEqual([
      { id: "a", version: "1.0.0" },
      { id: "b", version: "2.1.0" },
    ]);
    expect(parseNames("")).toEqual([]);
  });

  it("names a set by its gameplay mods, display mods or not", () => {
    expect(labelFor(base)).toBe("Competitive");
  });

  it("adds what isn't in the set", () => {
    expect(labelFor(`${base}, me.volleyball 1.0.0`)).toBe("Competitive + Volleyball");
  });

  it("isn't the set when a gameplay mod of it is missing or another version", () => {
    expect(labelFor("tgg.netplay 0.10.0, tgg.direct-connect 0.6.0")).toBe("No gameplay mods");
    expect(labelFor(`${base.replace("1.0.0", "2.0.0")}`)).toBe("UCF");
    expect(labelFor("tgg.netplay 0.10.0, tgg.direct-connect 0.6.0, me.volleyball 1.0.0")).toBe(
      "Volleyball"
    );
  });

  it("never names a queue after a set of online plumbing alone", () => {
    const online: LabelSet = {
      title: "Online play",
      mods: ["tgg.netplay", "tgg.direct-connect", "tgg.http", "tgg.unlocks"].map((mod) => ({
        mod,
        range: "*",
        counted: true,
      })),
    };
    const profile = parseNames(`${base}, tgg.http 1.0.0, tgg.unlocks 2.0.0`);
    expect(queueFor(profile, [online, competitive], names).label).toBe("Competitive");
    expect(queueFor(parseNames("tgg.netplay 0.10.0"), [online], names).label).toBe(
      "No gameplay mods"
    );
  });

  it("is a standing queue only when the set is one and nothing is added", () => {
    const queue: LabelSet = { ...competitive, name: "competitive", queue: true };
    expect(queueFor(parseNames(base), [queue], names)).toEqual({
      label: "Competitive",
      set: "competitive",
    });
    expect(queueFor(parseNames(`${base}, me.volleyball 1.0.0`), [queue], names).set).toBeNull();
    expect(queueFor(parseNames(base), [{ ...queue, queue: false }], names).set).toBeNull();
  });
});

describe("registry queue loading", () => {
  const db = createDb(env.DB);
  const now = new Date();
  const linuxLayout = "1".repeat(16);
  const winLayout = "2".repeat(16);

  type ModFixture = {
    slug: string;
    name: string;
    kind: CodeModKind;
    releaseClass?: "display" | "offline" | null;
    builds: {
      layoutId?: string | null;
      status: "queued" | "building" | "succeeded" | "failed";
      netplay: CodeModNetplay | null;
    }[];
  };

  const fixtures: ModFixture[] = [
    {
      slug: "tgg.netplay",
      name: "Netplay",
      kind: "native",
      builds: [
        { layoutId: linuxLayout, status: "succeeded", netplay: "code" },
        { layoutId: winLayout, status: "succeeded", netplay: "code" },
      ],
    },
    {
      slug: "tgg.direct-connect",
      name: "Direct Connect",
      kind: "native",
      builds: [{ layoutId: linuxLayout, status: "succeeded", netplay: "code" }],
    },
    {
      slug: "tgg.ucf",
      name: "UCF",
      kind: "script",
      builds: [{ layoutId: null, status: "succeeded", netplay: "code" }],
    },
    {
      slug: "tgg.competitive-rules",
      name: "Competitive Rules",
      kind: "script",
      builds: [{ layoutId: null, status: "succeeded", netplay: "display" }],
    },
    {
      slug: "tgg.legal-stages",
      name: "Legal Stages",
      kind: "script",
      builds: [{ layoutId: null, status: "succeeded", netplay: "display" }],
    },
    {
      slug: "tgg.offline-script",
      name: "Offline Script",
      kind: "script",
      builds: [{ layoutId: null, status: "succeeded", netplay: "offline" }],
    },
    {
      slug: "tgg.replay-player",
      name: "Replay Player",
      kind: "native",
      releaseClass: "offline",
      builds: [{ layoutId: linuxLayout, status: "succeeded", netplay: "offline" }],
    },
    {
      slug: "tgg.native-display",
      name: "Native Display",
      kind: "native",
      releaseClass: "display",
      // Stale pre-rebuild package still has netplay "code", but release.class is "display".
      builds: [{ layoutId: linuxLayout, status: "succeeded", netplay: "code" }],
    },
    {
      slug: "tgg.menu-data",
      name: "Menu Data",
      kind: "content",
      builds: [{ layoutId: null, status: "succeeded", netplay: "data" }],
    },
    {
      slug: "tgg.stage-files",
      name: "Stage Files",
      kind: "content",
      builds: [{ layoutId: null, status: "succeeded", netplay: "files" }],
    },
    {
      slug: "tgg.fighter-costumes",
      name: "Fighter Costumes",
      kind: "content",
      builds: [{ layoutId: null, status: "succeeded", netplay: "costumes" }],
    },
    {
      slug: "tgg.unbuilt",
      name: "Unbuilt",
      kind: "native",
      builds: [],
    },
    {
      slug: "tgg.failed-code-succeeded-display",
      name: "Display After Failed Code",
      kind: "native",
      builds: [
        { layoutId: linuxLayout, status: "failed", netplay: "code" },
        { layoutId: winLayout, status: "succeeded", netplay: "display" },
      ],
    },
    {
      slug: "tgg.rebuilding-to-code",
      name: "Rebuilding To Code",
      kind: "native",
      builds: [
        { layoutId: linuxLayout, status: "succeeded", netplay: "display" },
        { layoutId: winLayout, status: "succeeded", netplay: "code" },
      ],
    },
  ];

  const expectedCounted = [
    "tgg.netplay",
    "tgg.direct-connect",
    "tgg.ucf",
    "tgg.stage-files",
    "tgg.fighter-costumes",
    "tgg.unbuilt",
    "tgg.rebuilding-to-code",
  ];

  beforeAll(async () => {
    await signIn(db, "owner");
    await db.insert(games).values({
      id: "melee",
      name: "Super Smash Bros. Melee",
      slug: "melee",
      shortName: "Melee",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(codeModLayouts).values([
      {
        id: linuxLayout,
        api: "tgg-melee/1",
        port: "tgg-melee",
        target: "x86_64-linux-gnu",
        portVersion: "1.0.0",
        createdAt: now,
      },
      {
        id: winLayout,
        api: "tgg-melee/1",
        port: "tgg-melee",
        target: "x86_64-windows-msvc",
        portVersion: "1.0.0",
        createdAt: now,
      },
    ]);
    await db.insert(codeModSets).values({
      name: "competitive",
      title: "Competitive",
      description: "",
      version: 1,
      queue: true,
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, mod] of fixtures.entries()) {
      const modId = `mod-${index}`;
      const releaseId = `rel-${index}`;
      await db.insert(codeMods).values({
        id: modId,
        userId: "owner",
        gameId: "melee",
        slug: mod.slug,
        name: mod.name,
        sourceKind: "push",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(codeModReleases).values({
        id: releaseId,
        codeModId: modId,
        version: "1.0.0",
        tag: "v1.0.0",
        commitSha: String(index).padStart(40, "0"),
        status: "approved",
        class: mod.releaseClass ?? null,
        kind: mod.kind,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      for (const [buildIndex, build] of mod.builds.entries()) {
        await db.insert(codeModBuilds).values({
          id: `build-${index}-${buildIndex}`,
          releaseId,
          layoutId: build.layoutId ?? null,
          status: build.status,
          netplay: build.netplay,
          createdAt: now,
        });
      }
      await db.insert(codeModSetMods).values({
        setName: "competitive",
        mod: mod.slug,
        range: "^1.0",
        position: index,
      });
    }
  });

  it("excludes script display/offline and content data mods from standingQueues", async () => {
    const queues = await standingQueues(env);
    expect(queues).toEqual([
      {
        set: "competitive",
        label: "Competitive",
        mods: expectedCounted.map((id) => ({ id, version: "1.0.0" })),
      },
    ]);
  });

  it("matches queueInfo when the game sends only counted mods and omits display/offline/data scripts", async () => {
    const namesHeader = expectedCounted.map((id) => `${id} 1.0.0`).join(", ");
    expect(await queueInfo(env, namesHeader)).toEqual({
      label: "Competitive",
      set: "competitive",
      mods: expectedCounted.map((id) => ({ id, version: "1.0.0" })),
    });
  });
});
