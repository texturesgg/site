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

// The targets the image cross-compiles for: the C compiler and the CMake
// toolchain file (image/toolchains/) `tgg mod build` uses. Linux, the image's
// own system, needs neither. macOS layouts aren't built in the image.
const CROSS: Record<string, { cc: string; toolchain: string }> = {
  "x86_64-windows-gnu": {
    cc: "x86_64-w64-mingw32-gcc",
    toolchain: "/opt/tgg/toolchains/x86_64-windows-gnu.cmake",
  },
};

/**
 * The `tgg mod build` command, and its environment, that builds the mod
 * whose source zip is on stdin for `layout`, whose SDK targets `target`. The
 * package records `commit`, the reviewed source it came from, which peers on
 * different systems compare, and the class its review gave it, if any.
 */
export function buildCommand(
  layout: string,
  target: string,
  commit: string,
  releaseClass: "display" | null = null
): { args: string[]; env: Record<string, string> } {
  const args = [
    "tgg",
    "mod",
    "build",
    "/workspace/mod",
    "--source-zip",
    "-",
    "--sdk",
    `/opt/tgg/sdks/${layout}`,
    "-o",
    "/workspace/package.zip",
    "--json",
    "--source-commit",
    commit,
    ...(releaseClass ? ["--class", releaseClass] : []),
  ];
  const cross = CROSS[target];
  if (!cross) return { args, env: BUILD_ENV };
  // CMake takes the toolchain file from its environment when tgg names none.
  return {
    args: [...args, "--cc", cross.cc],
    env: { ...BUILD_ENV, CMAKE_TOOLCHAIN_FILE: cross.toolchain },
  };
}

export type BuildResult = {
  // The builder image this build ran in, pinned by digest.
  image: string;
  // tgg's stderr: the compiler's output and any refusal.
  log: string;
} & ({ ok: true; report: string; zip: Uint8Array } | { ok: false; exitCode: number });

export class Builder extends DurableObject<BuildEnv> {
  /**
   * Build `source` (a zip of the mod's source) for `layout`, whose SDK
   * targets `target`, against the game SDK the builder image carries for it,
   * whose symbols.txt tgg checks hooks and links against.
   */
  async build(
    layout: string,
    target: string,
    commit: string,
    releaseClass: "display" | null,
    source: Uint8Array<ArrayBuffer>
  ): Promise<BuildResult> {
    const container = this.ctx.container;
    if (!container) throw new Error("the Builder has no container");
    const image = container.images.builder;
    if (!container.running) {
      container.start({ image, enableInternet: false, instance: "lite" });
    }
    const command = buildCommand(layout, target, commit, releaseClass);
    try {
      const decoder = new TextDecoder();
      const built = await (
        await container.exec(command.args, {
          env: command.env,
          stdin: new Blob([source]).stream(),
          stdout: "pipe",
          stderr: "pipe",
        })
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
