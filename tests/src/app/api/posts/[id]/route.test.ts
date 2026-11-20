// @vitest-environment node
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, PUT } from "@/app/api/posts/[id]/route";
import { db } from "@/prisma/db";

const ctx = (id: string | number) => ({
  params: Promise.resolve({ id: String(id) }),
});
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/posts/x", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("/api/posts/[id]", () => {
  let id: number;

  beforeEach(async () => {
    await db.orm.public.Post.where((p) => p.id.gt(0)).deleteAll();
    ({ id } = await db.orm.public.Post.create({
      title: "Original",
      content: "Body",
    }));
  });
  afterAll(async () => {
    await db.orm.public.Post.where((p) => p.id.gt(0)).deleteAll();
    await db.close();
  });

  it("GET returns the post", async () => {
    const res = await GET(req("GET"), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id, title: "Original" });
  });

  it("GET returns 404 for a missing post and 400 for a bad id", async () => {
    expect((await GET(req("GET"), ctx(id + 1000))).status).toBe(404);
    expect((await GET(req("GET"), ctx("abc"))).status).toBe(400);
  });

  it("PATCH updates only the given fields", async () => {
    const res = await PATCH(req("PATCH", { title: "Changed" }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      title: "Changed",
      content: "Body",
    });
  });

  it("PATCH rejects an empty body and missing post", async () => {
    expect((await PATCH(req("PATCH", {}), ctx(id))).status).toBe(422);
    expect(
      (await PATCH(req("PATCH", { title: "x" }), ctx(id + 1000))).status,
    ).toBe(404);
  });

  it("PUT replaces the post", async () => {
    const res = await PUT(req("PUT", { title: "Replaced" }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      title: "Replaced",
      content: null,
    });
    expect((await PUT(req("PUT", { content: "x" }), ctx(id))).status).toBe(422);
  });

  it("DELETE removes the post", async () => {
    expect((await DELETE(req("DELETE"), ctx(id))).status).toBe(204);
    expect(await db.orm.public.Post.first({ id })).toBeNull();
    expect((await DELETE(req("DELETE"), ctx(id))).status).toBe(404);
  });
});
