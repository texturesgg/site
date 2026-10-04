// One build's container. Each build gets its own Builder instance, named for
// the build, and the container is destroyed when the build ends.

import { DurableObject } from "cloudflare:workers";

// The environment every build command runs with. Container exec doesn't pass
// on the image's own environment, so it is set here, in one place.
const BUILD_ENV = {
  PATH: "/bin",
  TMPDIR: "/tmp",
  // Nix's linker wrapper would add store paths to each mod's RUNPATH, which
  // makes package bytes depend on the build machine.
  NIX_DONT_SET_RPATH_x86_64_unknown_linux_gnu: "1",
};

export type BuildResult = {
  // The builder image this build ran in, pinned by digest.
  image: string;
  // tgg's stderr: the compiler's output and any refusal.
  log: string;
} & ({ ok: true; report: string; zip: Uint8Array } | { ok: false; exitCode: number });

export class Builder extends DurableObject<BuildEnv> {
  /**
   * Build `source` (a zip of manifest.json and src/) for `layout`, against
   * the game SDK and symbol list the builder image carries for it.
   */
  async build(layout: string, source: Uint8Array<ArrayBuffer>): Promise<BuildResult> {
    const container = this.ctx.container;
    if (!container) throw new Error("the Builder has no container");
    const image = container.images.builder;
    if (!container.running) {
      container.start({ image, enableInternet: false, instance: "lite" });
    }
    const sdk = `/opt/tgg/sdks/${layout}`;
    try {
      const decoder = new TextDecoder();
      const built = await (
        await container.exec(
          [
            "tgg",
            "mod",
            "build",
            "/workspace/mod",
            "--source-zip",
            "-",
            "--sdk",
            sdk,
            "--layout",
            `${sdk}/tgg-layout.json`,
            "-o",
            "/workspace/package.zip",
            "--json",
          ],
          { env: BUILD_ENV, stdin: new Blob([source]).stream(), stdout: "pipe", stderr: "pipe" }
        )
      ).output();
      const log = decoder.decode(built.stderr);
      if (built.exitCode !== 0) return { ok: false, image, log, exitCode: built.exitCode };
      const zip = await (
        await container.exec(["cat", "/workspace/package.zip"], { env: BUILD_ENV })
      ).output();
      if (zip.exitCode !== 0)
        throw new Error(`reading the package failed: ${decoder.decode(zip.stderr)}`);
      return {
        ok: true,
        image,
        log,
        report: decoder.decode(built.stdout),
        zip: new Uint8Array(zip.stdout),
      };
    } finally {
      await container.destroy();
    }
  }
}
