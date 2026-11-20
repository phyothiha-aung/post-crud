// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  errorResponse,
  escapeLike,
  INVALID_JSON,
  parseId,
  parsePositiveInt,
  readJson,
  validatePostInput,
} from "@/lib/post";

describe("validatePostInput", () => {
  describe("body shape", () => {
    it.each([
      ["null", null],
      ["a string", "hello"],
      ["a number", 42],
      ["an array", [{ title: "x" }]],
      ["undefined", undefined],
    ])("rejects %s", (_, body) => {
      expect(validatePostInput(body)).toEqual({
        ok: false,
        errors: { body: "Request body must be a JSON object" },
      });
    });
  });

  describe("full (create / PUT)", () => {
    it("accepts a title and content", () => {
      expect(validatePostInput({ title: "Hello", content: "World" })).toEqual({
        ok: true,
        data: { title: "Hello", content: "World" },
      });
    });

    it("trims the title", () => {
      const result = validatePostInput({ title: "  Hello  " });
      expect(result).toEqual({ ok: true, data: { title: "Hello" } });
    });

    it("leaves content out when it is not provided", () => {
      const result = validatePostInput({ title: "Hello" });
      expect(result.ok && "content" in result.data).toBe(false);
    });

    it("keeps content null and empty-string as given", () => {
      expect(validatePostInput({ title: "a", content: null })).toEqual({
        ok: true,
        data: { title: "a", content: null },
      });
      expect(validatePostInput({ title: "a", content: "" })).toEqual({
        ok: true,
        data: { title: "a", content: "" },
      });
    });

    it("ignores unknown fields", () => {
      expect(validatePostInput({ title: "a", id: 99, extra: true })).toEqual({
        ok: true,
        data: { title: "a" },
      });
    });

    it("requires a title", () => {
      expect(validatePostInput({ content: "x" })).toEqual({
        ok: false,
        errors: { title: "Title is required" },
      });
    });

    it.each([
      ["empty", ""],
      ["whitespace only", "   "],
      ["a number", 123],
      ["null", null],
      ["an object", { text: "x" }],
    ])("rejects a title that is %s", (_, title) => {
      expect(validatePostInput({ title })).toEqual({
        ok: false,
        errors: { title: "Title must be a non-empty string" },
      });
    });

    it("accepts a 255-character title and rejects 256", () => {
      expect(validatePostInput({ title: "a".repeat(255) }).ok).toBe(true);
      expect(validatePostInput({ title: "a".repeat(256) })).toEqual({
        ok: false,
        errors: { title: "Title must be at most 255 characters" },
      });
    });

    it.each([
      ["a number", 1],
      ["a boolean", false],
      ["an array", ["x"]],
    ])("rejects content that is %s", (_, content) => {
      expect(validatePostInput({ title: "a", content })).toEqual({
        ok: false,
        errors: { content: "Content must be a string or null" },
      });
    });

    it("reports title and content errors together", () => {
      expect(validatePostInput({ content: 5 })).toEqual({
        ok: false,
        errors: {
          title: "Title is required",
          content: "Content must be a string or null",
        },
      });
    });
  });

  describe("partial (PATCH)", () => {
    const partial = { partial: true };

    it("allows a missing title", () => {
      expect(validatePostInput({ content: "only content" }, partial)).toEqual({
        ok: true,
        data: { content: "only content" },
      });
    });

    it("allows only a title", () => {
      expect(validatePostInput({ title: " New " }, partial)).toEqual({
        ok: true,
        data: { title: "New" },
      });
    });

    it("allows clearing content with null", () => {
      expect(validatePostInput({ content: null }, partial)).toEqual({
        ok: true,
        data: { content: null },
      });
    });

    it("still validates fields that are present", () => {
      expect(validatePostInput({ title: "" }, partial)).toEqual({
        ok: false,
        errors: { title: "Title must be a non-empty string" },
      });
    });

    it("rejects an empty update", () => {
      expect(validatePostInput({}, partial)).toEqual({
        ok: false,
        errors: { body: "Provide at least one of: title, content" },
      });
      expect(validatePostInput({ unknown: 1 }, partial)).toEqual({
        ok: false,
        errors: { body: "Provide at least one of: title, content" },
      });
    });
  });
});

describe("parseId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["007", 7],
    ["2147483647", 2147483647], // max Postgres int4
  ])("parses %s", (raw, expected) => {
    expect(parseId(raw)).toBe(expected);
  });

  it.each([
    "0",
    "-1",
    "1.5",
    "1e3",
    "abc",
    "12abc",
    "",
    " 1",
    "2147483648", // overflows int4
    "99999999999999999999",
  ])("returns null for %j", (raw) => {
    expect(parseId(raw)).toBeNull();
  });
});

describe("parsePositiveInt", () => {
  it("parses a positive integer", () => {
    expect(parsePositiveInt("5", 1)).toBe(5);
  });

  it.each([null, "", "abc", "0", "-5", "1.5", "2e2"])(
    "falls back for %j",
    (raw) => {
      expect(parsePositiveInt(raw, 7)).toBe(7);
    },
  );

  it("clamps to max", () => {
    expect(parsePositiveInt("1000", 10, 100)).toBe(100);
    expect(parsePositiveInt("100", 10, 100)).toBe(100);
    expect(parsePositiveInt("99", 10, 100)).toBe(99);
  });

  it("has no upper bound by default", () => {
    expect(parsePositiveInt("123456", 1)).toBe(123456);
  });
});

describe("escapeLike", () => {
  it("leaves plain text unchanged", () => {
    expect(escapeLike("hello world")).toBe("hello world");
  });

  it("escapes %, _ and backslash", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("snake_case")).toBe("snake\\_case");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("escapes every occurrence", () => {
    expect(escapeLike("%_%_\\")).toBe("\\%\\_\\%\\_\\\\");
  });

  it("handles an empty string", () => {
    expect(escapeLike("")).toBe("");
  });
});

describe("readJson", () => {
  const req = (body?: string) =>
    new Request("http://localhost/", { method: "POST", body });

  it("parses a JSON body", async () => {
    expect(await readJson(req('{"title":"x"}'))).toEqual({ title: "x" });
  });

  it("returns non-object JSON as-is", async () => {
    expect(await readJson(req("[1,2]"))).toEqual([1, 2]);
    expect(await readJson(req("null"))).toBeNull();
  });

  it("returns INVALID_JSON for malformed JSON", async () => {
    expect(await readJson(req("{not json"))).toBe(INVALID_JSON);
  });

  it("returns INVALID_JSON for an empty body", async () => {
    expect(await readJson(req())).toBe(INVALID_JSON);
  });
});

describe("errorResponse", () => {
  it("returns the status and message", async () => {
    const res = errorResponse(404, "Post not found");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ message: "Post not found" });
  });

  it("includes field errors when given", async () => {
    const res = errorResponse(422, "Validation failed", { title: "Required" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      message: "Validation failed",
      errors: { title: "Required" },
    });
  });
});
