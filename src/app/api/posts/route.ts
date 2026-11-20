import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/prisma/db";
import {
  errorResponse,
  escapeLike,
  INVALID_JSON,
  parsePositiveInt,
  readJson,
  validatePostInput,
  type PostInput,
} from "@/lib/post";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * GET /api/posts?page=1&limit=10&search=hello
 * Lists posts newest first, optionally filtered by a case-insensitive title match.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1);
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const search = params.get("search")?.trim() ?? "";

  const pattern = `%${escapeLike(search)}%`;
  const posts = db.orm.public.Post.where((p) => p.title.ilike(pattern));

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

/** POST /api/posts — body: { title: string, content?: string | null } */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body === INVALID_JSON) return errorResponse(400, "Invalid JSON body");

  const result = validatePostInput(body);
  if (!result.ok) return errorResponse(422, "Validation failed", result.errors);

  const { title, content = null } = result.data as PostInput;
  const post = await db.orm.public.Post.create({ title, content });

  return NextResponse.json({ data: post }, { status: 201 });
}
