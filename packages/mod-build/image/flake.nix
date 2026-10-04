{
  description = "The toolchain image textures.gg builds code mods in";

  inputs = {
    # The revision tgg-mod-runtime builds ports with, so mods compile with the
    # same GCC as the game they load into.
    nixpkgs.url = "github:NixOS/nixpkgs/c59305bab2065cfecc4944690d9eedbb56f3a9fa";
    # tgg-mod, which builds and packs each mod.
    core = {
      url = "github:texturesgg/texturesgg/b33a730bb3a2682162290894d9564e4375a6a50c";
      flake = false;
    };
  };

  outputs =
    { nixpkgs, core, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      tgg-mod = pkgs.rustPlatform.buildRustPackage {
        pname = "tgg-mod";
        version = "0.1.0";
        src = pkgs.runCommand "tgg-mod-src" { } ''
          mkdir -p $out
          cp ${./tgg-mod/Cargo.toml} $out/Cargo.toml
          cp ${./tgg-mod/Cargo.lock} $out/Cargo.lock
          cp -r ${core}/crates/tgg-mod $out/tgg-mod
        '';
        cargoLock.lockFile = ./tgg-mod/Cargo.lock;
        cargoBuildFlags = [ "-p" "tgg-mod" ];
        doCheck = false;
      };

      toolchain = pkgs.buildEnv {
        name = "tgg-mod-toolchain";
        # A mod build is one GCC call, which `tgg-mod build` makes. GCC only:
        # the game's on-disc structs use scalar_storage_order. coreutils gives
        # the container `sleep` to stay up and `cat` to hand the package back.
        paths = [
          pkgs.gcc
          pkgs.coreutils
          tgg-mod
        ];
      };
    in
    {
      packages.${system} = {
        inherit tgg-mod toolchain;

        # Nothing but the toolchain: no distribution, no shell beyond what GCC's
        # wrapper needs, and no game headers. The builder image adds each active
        # layout's game SDK on top, at /opt/tgg/sdks/<layout id>
        # (layout-layer.sh). The Worker drives it with the platform's
        # container exec, so no Sandbox server or file helper is needed.
        image = pkgs.dockerTools.streamLayeredImage {
          name = "tgg-mod-toolchain";
          tag = "latest";
          contents = [ toolchain ];
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
