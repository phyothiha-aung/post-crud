import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/prisma/db";
import {
  decodeCursor,
  encodeCursor,
  errorResponse,
  parsePositiveInt,
  PULL_SAFETY_LAG_MS,
} from "@/lib/post";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * GET /api/sync/pull?cursor=<token>&limit=100
 *
 * Returns every post changed after `cursor` — including soft-deleted
 * tombstones (`deletedAt` set) — ordered by (updatedAt, id). Omit `cursor`
 * for the first sync. Keep calling with `meta.cursor` while `meta.hasMore`.
 * Changes newer than PULL_SAFETY_LAG_MS are held back until a later pull.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return errorResponse(400, "Invalid cursor");

  const settled = new Date(Date.now() - PULL_SAFETY_LAG_MS);
  const ordered = db.orm.public.Post.where((p) =>
    p.updatedAt.lte(settled),
  ).orderBy([(p) => p.updatedAt.asc(), (p) => p.id.asc()]);
  const rows = await (cursor ? ordered.cursor(cursor) : ordered)
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);

  return NextResponse.json({
    data,
    meta: {
      // No new rows: hand back the same cursor so the client keeps its place.
      cursor: last ? encodeCursor(last) : rawCursor,
      hasMore,
      serverTime: new Date().toISOString(),
    },
  });
}
