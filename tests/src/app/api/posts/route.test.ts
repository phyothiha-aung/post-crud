// @vitest-environment node
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/posts/route";
import { db } from "@/prisma/db";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const url = (qs = "") => `http://localhost/api/posts${qs}`;
const post = (body: unknown) =>
  POST(
    new NextRequest(url(), {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("/api/posts", () => {
  beforeEach(async () => {
    await db.orm.public.Post.where((p) => p.id.isNotNull()).deleteAll();
  });
  afterAll(async () => {
    await db.orm.public.Post.where((p) => p.id.isNotNull()).deleteAll();
    await db.close();
  });

  describe("POST", () => {
    it("creates a post", async () => {
      const res = await post({ title: "  Hello  ", content: "World" });
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data).toMatchObject({ title: "Hello", content: "World" });
      expect(data.id).toMatch(UUID_V7);
      expect(data.deletedAt).toBeNull();
    });

    it("accepts a client-generated id", async () => {
      const id = "0190f3a8-7c4e-7d2a-9b1c-1234567890ab";
      const res = await post({ id, title: "Offline" });
      expect(res.status).toBe(201);
      expect((await res.json()).data.id).toBe(id);
    });

    it("returns 409 when the client id already exists", async () => {
      const id = "0190f3a8-7c4e-7d2a-9b1c-1234567890ab";
      await post({ id, title: "First" });
      const res = await post({ id, title: "Second" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        message: "A post with this id already exists",
      });
    });

    it("rejects an id that is not a UUID", async () => {
      const res = await post({ id: "123", title: "Bad id" });
      expect(res.status).toBe(422);
      expect((await res.json()).errors).toEqual({ id: "id must be a UUID" });
    });

    it("defaults content to null", async () => {
      const { data } = await (await post({ title: "No content" })).json();
      expect(data.content).toBeNull();
    });

    it("rejects a missing title", async () => {
      const res = await post({ content: "x" });
      expect(res.status).toBe(422);
      expect((await res.json()).errors.title).toBeDefined();
    });

    it("rejects invalid JSON", async () => {
      expect((await post("{not json")).status).toBe(400);
    });
  });

  describe("GET", () => {
    beforeEach(async () => {
      for (let i = 1; i <= 15; i++) {
        await db.orm.public.Post.create({ title: `Post ${i}`, content: null });
      }
      await db.orm.public.Post.create({
        title: "Learning React",
        content: null,
      });
      await db.orm.public.Post.create({ title: "100% done_ok", content: null });
    });

    const get = async (qs = "") => (await GET(new NextRequest(url(qs)))).json();

    it("paginates with defaults", async () => {
      const { data, meta } = await get();
      expect(data).toHaveLength(10);
      expect(meta).toEqual({
        page: 1,
        limit: 10,
        total: 17,
        totalPages: 2,
        search: null,
      });
    });

    it("returns the requested page", async () => {
      const { data, meta } = await get("?page=2&limit=10");
      expect(data).toHaveLength(7);
      expect(meta.page).toBe(2);
    });

    it("clamps limit to 100 and ignores bad values", async () => {
      expect((await get("?limit=1000")).meta.limit).toBe(100);
      expect((await get("?limit=abc&page=-1")).meta).toMatchObject({
        page: 1,
        limit: 10,
      });
    });

    it("searches title case-insensitively", async () => {
      const { data, meta } = await get("?search=react");
      expect(meta.total).toBe(1);
      expect(data[0].title).toBe("Learning React");
    });

    it("treats LIKE wildcards literally", async () => {
      expect((await get("?search=%25")).meta.total).toBe(1);
      expect((await get("?search=_")).meta.total).toBe(1);
    });

    it("hides soft-deleted posts", async () => {
      await db.orm.public.Post.where({ title: "Learning React" }).update({
        deletedAt: new Date(),
      });
      expect((await get()).meta.total).toBe(16);
      expect((await get("?search=react")).meta.total).toBe(0);
    });

    it("combines search with pagination", async () => {
      const { data, meta } = await get("?search=post&limit=5&page=3");
      expect(meta).toMatchObject({ total: 15, totalPages: 3 });
      expect(data).toHaveLength(5);
    });
  });
});
