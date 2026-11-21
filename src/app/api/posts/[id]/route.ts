import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/prisma/db";
import {
  errorResponse,
  INVALID_JSON,
  parseId,
  readJson,
  validatePostInput,
} from "@/lib/post";

type Context = { params: Promise<{ id: string }> };

/** Only live posts are visible through the REST API; soft-deleted ones 404. */
const live = (id: string) =>
  db.orm.public.Post.where({ id }).where((p) => p.deletedAt.isNull());

const notFound = () => errorResponse(404, "Post not found");
const invalidId = () => errorResponse(400, "Invalid post id");

/** GET /api/posts/:id */
export async function GET(_req: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) return invalidId();

  const post = await live(id).first();
  return post ? NextResponse.json({ data: post }) : notFound();
}

/** PATCH /api/posts/:id — partial update; body: { title?: string, content?: string | null } */
export async function PATCH(req: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) return invalidId();

  const body = await readJson(req);
  if (body === INVALID_JSON) return errorResponse(400, "Invalid JSON body");

  const result = validatePostInput(body, { partial: true });
  if (!result.ok) return errorResponse(422, "Validation failed", result.errors);

  const post = await live(id).update(result.data);
  return post ? NextResponse.json({ data: post }) : notFound();
}

/** PUT /api/posts/:id — full replace; body: { title: string, content?: string | null } */
export async function PUT(req: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) return invalidId();

  const body = await readJson(req);
  if (body === INVALID_JSON) return errorResponse(400, "Invalid JSON body");

  const result = validatePostInput(body);
  if (!result.ok) return errorResponse(422, "Validation failed", result.errors);

  const { title, content = null } = result.data;
  const post = await live(id).update({
    title,
    content,
  });
  return post ? NextResponse.json({ data: post }) : notFound();
}

/** DELETE /api/posts/:id — soft delete: sets `deletedAt` so sync clients see a tombstone. */
export async function DELETE(_req: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) return invalidId();

  const post = await live(id).update({ deletedAt: new Date() });
  return post ? new NextResponse(null, { status: 204 }) : notFound();
}
