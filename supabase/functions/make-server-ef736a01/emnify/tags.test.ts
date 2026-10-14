import { describe, expect, it } from "vitest";
import { formatTags, parseTags } from "./tags.ts";

describe("parseTags", () => {
  it("splits the comma-separated string emnify returns", () => {
    expect(parseTags("sensor,outdoor")).toEqual(["sensor", "outdoor"]);
  });

  it("trims whitespace and drops empty entries", () => {
    expect(parseTags(" sensor , ,outdoor, ")).toEqual(["sensor", "outdoor"]);
  });

  it("accepts an array as-is", () => {
    expect(parseTags(["a", " b "])).toEqual(["a", "b"]);
  });

  it("returns an empty list for missing or unexpected values", () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(42)).toEqual([]);
  });
});

describe("formatTags", () => {
  it("joins a list into the string emnify expects", () => {
    expect(formatTags(["sensor", "outdoor"])).toBe("sensor,outdoor");
  });

  it("returns an empty string when there are no tags", () => {
    expect(formatTags([])).toBe("");
    expect(formatTags(undefined)).toBe("");
  });
});
