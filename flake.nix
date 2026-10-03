{
  description = "textures.gg development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      nixpkgs,
      fenix,
      ...
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-darwin"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
      devShellFor =
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          inherit (pkgs.stdenv.hostPlatform) isLinux;
          fenixPackages = fenix.packages.${system};
          rustToolchain = fenixPackages.combine [
            (fenixPackages.stable.withComponents [
              "cargo"
              "clippy"
              "rust-src"
              "rustc"
              "rustfmt"
            ])
            fenixPackages.targets.wasm32-unknown-unknown.stable.rust-std
          ];
          # pnpm 12 publishes its executables as optional per-platform packages.
          # Corepack 0.35 unpacks only the launcher package, so pin the matching
          # binary here; keep both platforms on the package.json version.
          pnpmExe =
            {
              x86_64-linux = {
                url = "https://registry.npmjs.org/@pnpm/exe.linux-x64/-/exe.linux-x64-12.0.0-beta.4.tgz";
                hash = "sha512-n9e5JgFAmwt5a5aIHy15Yeaij0qwnNEobkC4IRqjntDq90hD89hSijvIpcIdkbaOkGH88UKrY1TwJxzypfRGjQ==";
              };
              aarch64-darwin = {
                url = "https://registry.npmjs.org/@pnpm/exe.darwin-arm64/-/exe.darwin-arm64-12.0.0-beta.4.tgz";
                hash = "sha512-tiQOpZ3nvl/OXZmHg57I6NyrOIdo3Vv+EH8AVmvZ+FkZtXAA9QVt/+o5SSilxJRr5TvsCcVX/8D0gGfHtEziOQ==";
              };
            }
            .${system};
          pnpm = pkgs.stdenvNoCC.mkDerivation {
            pname = "pnpm";
            version = "12.0.0-beta.4";
            src = pkgs.fetchurl pnpmExe;
            sourceRoot = "package";
            nativeBuildInputs = pkgs.lib.optionals isLinux [ pkgs.autoPatchelfHook ];
            buildInputs = pkgs.lib.optionals isLinux [ pkgs.stdenv.cc.cc.lib ];
            installPhase = ''
              runHook preInstall
              install -Dm755 pnpm $out/bin/pnpm
              runHook postInstall
            '';
          };
        in
        pkgs.mkShell {
          packages = [
            rustToolchain
            pnpm
            # wasm-pack runs the wasm-opt on PATH; without one it downloads a
            # generic Linux build that starts only through nix-ld.
            pkgs.binaryen
            pkgs.git
            pkgs.nodejs_24
            pkgs.rust-analyzer
            pkgs.wasm-pack
          ];

          RUST_BACKTRACE = "1";
        };
    in
    {
      devShells = forEachSystem (system: {
        default = devShellFor system;
      });
    };
}
