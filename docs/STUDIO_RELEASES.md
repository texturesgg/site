# App releases on the download page

The download page (`/download`, with code mods on) reads the newest app release from
`https://assets.textures.gg/studio/latest.json` when it loads. A release needs no site
change: the app's release workflow uploads the file after its packages are up.

```json
{
  "version": "0.3.0",
  "released": "2026-12-01",
  "notes_url": "https://github.com/texturesgg/tgg-studio/releases/tag/v0.3.0",
  "assets": {
    "windows": [
      {
        "kind": "Installer",
        "url": "https://github.com/texturesgg/tgg-studio/releases/download/v0.3.0/textures.gg-0.3.0-windows-x86_64-setup.exe",
        "size": 48500000,
        "sha256": "…64 lower-case hex digits…",
        "min_os": "Windows 10 or later, 64-bit"
      },
      { "kind": "Zip", "url": "https://…/textures.gg-0.3.0-windows-x86_64.zip", "size": 51200000 }
    ],
    "macos": [
      {
        "kind": "dmg",
        "url": "https://…/textures.gg-0.3.0-macos-arm64.dmg",
        "size": 61300000,
        "min_os": "macOS 12 or later, Apple silicon"
      }
    ],
    "linux": []
  }
}
```

| Field | |
| --- | --- |
| `version` | Shown in the page's description. Required. |
| `released` | ISO date or date-time. Optional. |
| `notes_url` | https link to the release notes, shown as "What's new in …". Optional. |
| `assets.windows`, `assets.macos`, `assets.linux` | Each a list of files, up to 10. Missing or empty shows "Coming soon". |
| `kind` | What the file is. The first file is the Download button; the others are buttons labeled with their `kind`. |
| `url` | Full https URL. The file name shown is the URL's last part. |
| `size` | Bytes, shown in MB. |
| `sha256` | Optional, lower-case hex. |
| `min_os` | What it runs on, shown as written under the platform's name. Optional. |

The schema is `StudioRelease` in `packages/shared/src/studio-release.ts`. A file that doesn't
parse, or one with only `version` (the old `editor/latest.json` shape), shows every platform
as "Coming soon", so upload the file only once the files it links exist.

Upload it with `Cache-Control: public, max-age=300` and `Content-Type: application/json`,
to the `vgskins-assets` bucket at `studio/latest.json`.
