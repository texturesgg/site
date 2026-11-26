{
  description = "The toolchain image textures.gg builds code mods in";

  inputs = {
    # tgg-melee release.json's toolchain.nixpkgs, so mods compile with the
    # same GCC as the game they load into.
    nixpkgs.url = "github:NixOS/nixpkgs/c59305bab2065cfecc4944690d9eedbb56f3a9fa";
  };

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # tgg's released static Linux build, the same binary `tgg mod build`
      # runs as on a mod maker's machine, so registry packages match theirs.
      tgg = pkgs.stdenvNoCC.mkDerivation rec {
        pname = "tgg";
        version = "1.0.0";
        src = pkgs.fetchurl {
          url = "https://github.com/texturesgg/texturesgg/releases/download/cli-v${version}/tgg-${version}-x86_64-unknown-linux-musl.tar.gz";
          hash = "sha256-3iDQADeB+iVNVnBd8RFj+6/2+36zlLlpmVVNwaPdiec=";
        };
        installPhase = ''
          install -Dm755 tgg $out/bin/tgg
        '';
      };

      # MinGW-w64 GCC, which tgg-melee's Windows build is compiled with (its
      # flake's `windows` shell), for mods for the Windows layouts.
      mingw = pkgs.pkgsCross.mingwW64;

      # Patch dynamically linked Linux SDK tools (like tgg-script) to use the
      # container's own glibc and libgcc_s rather than /lib64/ld-linux-x86-64.so.2.
      sdkRuntime = [
        pkgs.glibc
        pkgs.stdenv.cc.cc.lib
      ];
      patch-sdk-tools = pkgs.writeShellScript "patch-sdk-tools" ''
        set -euo pipefail
        root=$1
        for f in "$root"/opt/tgg/sdks/*/tools/*; do
          [ -f "$f" ] || continue
          if ${pkgs.patchelf}/bin/patchelf --print-interpreter "$f" >/dev/null 2>&1; then
            ${pkgs.patchelf}/bin/patchelf \
              --set-interpreter "${pkgs.glibc}/lib/ld-linux-x86-64.so.2" \
              --set-rpath "${pkgs.glibc}/lib:${pkgs.stdenv.cc.cc.lib}/lib" \
              "$f"
          fi
        done
      '';

      # CMake toolchain files by target triple, at /opt/tgg/toolchains/: the
      # Builder hands one to `tgg mod build` for a layout whose SDK targets
      # another system than the image's own.
      toolchains = pkgs.runCommand "tgg-mod-toolchains" { } ''
        mkdir -p $out/opt/tgg/toolchains
        substitute ${./toolchains/x86_64-windows-gnu.cmake} \
          $out/opt/tgg/toolchains/x86_64-windows-gnu.cmake \
          --subst-var-by mcfgthreads ${mingw.windows.mcfgthreads}
        # Pin the SDK tool runtime store paths in the image closure.
        printf '%s\n' ${pkgs.lib.concatStringsSep " " sdkRuntime} > $out/opt/tgg/toolchains/.sdk-runtime
      '';

      toolchain = pkgs.buildEnv {
        name = "tgg-mod-toolchain";
        # `tgg mod build` runs the SDK's own CMake files (TggMod.cmake) with
        # CMake and Ninja; they read the objects with binutils' nm, and Ninja
        # runs each step through /bin/sh (bash). GCC only: the game's on-disc
        # structs use scalar_storage_order; MinGW's GCC for Windows layouts.
        # coreutils gives the container `sleep` to stay up and `cat` to hand
        # the package back.
        paths = [
          pkgs.gcc
          mingw.buildPackages.gcc
          pkgs.binutils
          pkgs.cmake
          pkgs.ninja
          pkgs.bash
          pkgs.coreutils
          tgg
        ];
      };
    in
    {
      packages.${system} = {
        inherit tgg toolchain toolchains patch-sdk-tools;

        # Nothing but the toolchain: no distribution, no shell beyond what GCC's
        # wrapper needs, and no game headers. The builder image adds each active
        # layout's game SDK on top, at /opt/tgg/sdks/<layout id>
        # (fetch-sdks.sh). The Worker drives it with the platform's
        # container exec, so no Sandbox server or file helper is needed.
        image = pkgs.dockerTools.streamLayeredImage {
          name = "tgg-mod-toolchain";
          tag = "latest";
          contents = [
            toolchain
            toolchains
          ];
          extraCommands = ''
            mkdir -p tmp workspace
            chmod 1777 tmp
          '';
          config = {
            Cmd = [ "sleep" "infinity" ];
            WorkingDir = "/workspace";
            Env = [
              "PATH=/bin"
              "TMPDIR=/tmp"
              # Nix's linker wrapper would add store paths to each mod's
              # RUNPATH, which makes package bytes depend on the build host.
              "NIX_DONT_SET_RPATH_x86_64_unknown_linux_gnu=1"
            ];
          };
        };
      };
    };
}
