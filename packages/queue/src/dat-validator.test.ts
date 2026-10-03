import { expect, it } from "vitest";
import { validateDat } from "./dat-validator";

// The queue instantiates the parser itself instead of through wasm-bindgen's
// glue; this runs the real module, so an ABI change on a wasm-bindgen bump
// fails here rather than in production.
it("the parser reports why bytes that are not a DAT are invalid", async () => {
  const bytes = new TextEncoder().encode("not a DAT file");
  const body = new Blob([bytes]).stream();
  await expect(validateDat(body, bytes.byteLength)).resolves.toEqual(expect.any(String));
});
