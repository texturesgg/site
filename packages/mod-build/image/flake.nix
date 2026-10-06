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
        version = "0.2.0";
        src = pkgs.fetchurl {
          url = "https://github.com/texturesgg/texturesgg/releases/download/cli-v${version}/tgg-${version}-x86_64-unknown-linux-musl.tar.gz";
          hash = "sha256-yNd98Q0K0SqGHFJ6Lr+rd4/YHkVP60QyHzY0ADw6cwc=";
        };
        installPhase = ''
          install -Dm755 tgg $out/bin/tgg
        '';
      };

      toolchain = pkgs.buildEnv {
        name = "tgg-mod-toolchain";
        # A mod build is one GCC call, which `tgg mod build` makes. GCC only:
        # the game's on-disc structs use scalar_storage_order. coreutils gives
        # the container `sleep` to stay up and `cat` to hand the package back.
        paths = [
          pkgs.gcc
          pkgs.coreutils
          tgg
        ];
      };
    in
    {
      packages.${system} = {
        inherit tgg toolchain;

        # Nothing but the toolchain: no distribution, no shell beyond what GCC's
        # wrapper needs, and no game headers. The builder image adds each active
        # layout's game SDK on top, at /opt/tgg/sdks/<layout id>
        # (fetch-sdks.sh). The Worker drives it with the platform's
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
