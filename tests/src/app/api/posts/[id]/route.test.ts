// @vitest-environment node
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, PUT } from "@/app/api/posts/[id]/route";
import { db } from "@/prisma/db";

const ctx = (id: string | number) => ({
  params: Promise.resolve({ id: String(id) }),
});

/** Build a request; objects are JSON-encoded, strings are sent raw (for malformed JSON). */
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/posts/x", {
    method,
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });

const INVALID_IDS = ["abc", "0", "-1", "1.5"];

describe("/api/posts/[id]", () => {
  let id: number;
  let missingId: number;

  beforeEach(async () => {
    await db.orm.public.Post.where((p) => p.id.gt(0)).deleteAll();
    ({ id } = await db.orm.public.Post.create({
      title: "Original",
      content: "Body",
    }));
    missingId = id + 1000;
  });
  afterAll(async () => {
    await db.orm.public.Post.where((p) => p.id.gt(0)).deleteAll();
    await db.close();
  });

  describe("GET", () => {
    it("returns the post", async () => {
      const res = await GET(req("GET"), ctx(id));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({
        id,
        title: "Original",
        content: "Body",
      });
    });

    it("returns 404 for a missing post", async () => {
      const res = await GET(req("GET"), ctx(missingId));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: "Post not found" });
    });

    it.each(INVALID_IDS)("returns 400 for invalid id %j", async (bad) => {
      const res = await GET(req("GET"), ctx(bad));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid post id" });
    });
  });

  describe("PATCH", () => {
    it("updates only the given fields", async () => {
      const res = await PATCH(req("PATCH", { title: "Changed" }), ctx(id));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({
        title: "Changed",
        content: "Body",
      });
    });

    it("can clear content with null", async () => {
      const res = await PATCH(req("PATCH", { content: null }), ctx(id));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({
        title: "Original",
        content: null,
      });
    });

    it("returns 422 for an empty or invalid body", async () => {
      const empty = await PATCH(req("PATCH", {}), ctx(id));
      expect(empty.status).toBe(422);
      expect((await empty.json()).errors).toHaveProperty("body");

      const invalid = await PATCH(req("PATCH", { title: "" }), ctx(id));
      expect(invalid.status).toBe(422);
      expect((await invalid.json()).errors).toHaveProperty("title");
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await PATCH(req("PATCH", "{not json"), ctx(id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid JSON body" });
    });

    it("returns 404 for a missing post", async () => {
      const res = await PATCH(req("PATCH", { title: "x" }), ctx(missingId));
      expect(res.status).toBe(404);
    });

    it.each(INVALID_IDS)("returns 400 for invalid id %j", async (bad) => {
      const res = await PATCH(req("PATCH", { title: "x" }), ctx(bad));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid post id" });
    });
  });

  describe("PUT", () => {
    it("replaces the post, defaulting missing content to null", async () => {
      const res = await PUT(req("PUT", { title: "Replaced" }), ctx(id));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({
        title: "Replaced",
        content: null,
      });
    });

    it("replaces both title and content", async () => {
      const res = await PUT(
        req("PUT", { title: "New", content: "New body" }),
        ctx(id),
      );
      expect((await res.json()).data).toMatchObject({
        title: "New",
        content: "New body",
      });
    });

    it("returns 422 when title is missing", async () => {
      const res = await PUT(req("PUT", { content: "x" }), ctx(id));
      expect(res.status).toBe(422);
      expect((await res.json()).errors).toHaveProperty("title");
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await PUT(req("PUT", "{not json"), ctx(id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid JSON body" });
    });

    it("returns 404 for a missing post", async () => {
      const res = await PUT(req("PUT", { title: "x" }), ctx(missingId));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: "Post not found" });
    });

    it.each(INVALID_IDS)("returns 400 for invalid id %j", async (bad) => {
      const res = await PUT(req("PUT", { title: "x" }), ctx(bad));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid post id" });
    });
  });

  describe("DELETE", () => {
    it("removes the post and returns 204 with no body", async () => {
      const res = await DELETE(req("DELETE"), ctx(id));
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      expect(await db.orm.public.Post.first({ id })).toBeNull();
    });

    it("returns 404 for a missing post", async () => {
      const res = await DELETE(req("DELETE"), ctx(missingId));
      expect(res.status).toBe(404);
    });

    it.each(INVALID_IDS)("returns 400 for invalid id %j", async (bad) => {
      const res = await DELETE(req("DELETE"), ctx(bad));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid post id" });
    });
  });
});
