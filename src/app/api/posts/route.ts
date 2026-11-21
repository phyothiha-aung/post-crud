import { NextResponse, type NextRequest } from "next/server";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import {
  errorResponse,
  escapeLike,
  INVALID_JSON,
  parseId,
  parsePositiveInt,
  readJson,
  validatePostInput,
  type PostInput,
} from "@/lib/post";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * GET /api/posts?page=1&limit=10&search=hello
 * Lists live (not soft-deleted) posts newest first, optionally filtered by a
 * case-insensitive title match. Offline clients should use /api/sync instead.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1);
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const search = params.get("search")?.trim() ?? "";

  const pattern = `%${escapeLike(search)}%`;
  const posts = db.orm.public.Post.where((p) =>
    and(p.deletedAt.isNull(), p.title.ilike(pattern)),
  );

  const [data, totals] = await Promise.all([
    posts
      .orderBy([(p) => p.createdAt.desc(), (p) => p.id.desc()])
      .limit(limit)
      .offset((page - 1) * limit)
      .all(),
    posts.aggregate((a) => ({ total: a.count() })),
  ]);

  const total = totals.total;
  return NextResponse.json({
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      search: search || null,
    },
  });
}

/**
 * POST /api/posts — body: { id?: uuid, title: string, content?: string | null }
 * `id` lets an offline client pick the id up front; the server generates a UUIDv7 otherwise.
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body === INVALID_JSON) return errorResponse(400, "Invalid JSON body");

  const result = validatePostInput(body);
  const rawId = (body as { id?: unknown } | null)?.id;
  const id = rawId === undefined ? undefined : parseId(rawId);
  const errors = result.ok ? {} : { ...result.errors };
  if (id === null) errors.id = "id must be a UUID";
  if (!result.ok || id === null)
    return errorResponse(422, "Validation failed", errors);

  if (id && (await db.orm.public.Post.first({ id })))
    return errorResponse(409, "A post with this id already exists");

  const { title, content = null } = result.data as PostInput;
  try {
    const post = await db.orm.public.Post.create({
      ...(id && { id }),
      title,
      content,
    });
    return NextResponse.json({ data: post }, { status: 201 });
  } catch (error) {
    // Lost a race with a concurrent create of the same client id.
    if (id && (await db.orm.public.Post.first({ id })))
      return errorResponse(409, "A post with this id already exists");
    throw error;
  }
}
