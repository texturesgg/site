import { expect, it } from "vitest";
import { docsCandidates, docsMinors } from "./mod-docs";

it("tries a minor's releases newest first, and every release for latest", () => {
  const releases = ["0.1.0", "0.1.2", "0.1.10", "0.2.0", "0.10.1", "junk"];
  expect(docsCandidates("0.1", releases)).toEqual(["0.1.10", "0.1.2", "0.1.0"]);
  expect(docsCandidates("latest", releases)[0]).toBe("0.10.1");
  expect(docsCandidates("0.3", releases)).toEqual([]);
});

it("puts a minor's prereleases after its releases", () => {
  const before = ["0.1.0-rc.2", "0.1.0-rc.10", "0.1.0-rc.9"];
  expect(docsCandidates("0.1", before)).toEqual(["0.1.0-rc.10", "0.1.0-rc.9", "0.1.0-rc.2"]);
  const after = [...before, "0.1.0", "0.1.1-rc.1"];
  expect(docsCandidates("latest", after).slice(0, 2)).toEqual(["0.1.0", "0.1.1-rc.1"]);
});

it("lists each minor once, newest first", () => {
  expect(docsMinors(["0.1.0-rc.12", "0.1.0-rc.11", "0.10.0", "0.2.0"])).toEqual([
    "0.10",
    "0.2",
    "0.1",
  ]);
});
