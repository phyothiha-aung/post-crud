// @vitest-environment node
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/posts/route";
import { db } from "@/prisma/db";

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
    await db.orm.public.Post.where((p) => p.id.gt(0)).deleteAll();
  });
  afterAll(async () => {
    await db.orm.public.Post.where((p) => p.id.gt(0)).deleteAll();
    await db.close();
  });

  describe("POST", () => {
    it("creates a post", async () => {
      const res = await post({ title: "  Hello  ", content: "World" });
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data).toMatchObject({ title: "Hello", content: "World" });
      expect(data.id).toBeTypeOf("number");
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

    it("combines search with pagination", async () => {
      const { data, meta } = await get("?search=post&limit=5&page=3");
      expect(meta).toMatchObject({ total: 15, totalPages: 3 });
      expect(data).toHaveLength(5);
    });
  });
});
