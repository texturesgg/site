import { canonicalDatFileName } from "@vgskins/shared";

/**
 * A `Content-Disposition` value that downloads under `fileName`. The quoted
 * name is ASCII for older clients; `filename*` carries the full name.
 */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^ -~]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Zip entry names for mod files, in order: each a bare `.dat` name, and no two
 * alike even on a case-insensitive file system.
 */
export function zipEntryNames(fileNames: string[]): string[] {
  const used = new Set<string>();
  return fileNames.map((fileName) => {
    const name = canonicalDatFileName(fileName);
    const stem = name.slice(0, -".dat".length);
    let entry = name;
    for (let copy = 2; used.has(entry.toLowerCase()); copy++) {
      entry = `${stem} (${copy}).dat`;
    }
    used.add(entry.toLowerCase());
    return entry;
  });
}
