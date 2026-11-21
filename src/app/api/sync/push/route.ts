import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/prisma/db";
import {
  errorResponse,
  INVALID_JSON,
  readJson,
  validatePushChange,
  type PushChange,
} from "@/lib/post";

const MAX_CHANGES = 100;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PostRow = NonNullable<
  Awaited<ReturnType<typeof db.orm.public.Post.first>>
>;

export type PushResult = {
  id: string | null;
  status: "applied" | "conflict" | "rejected";
  /** The server's copy after the change (or the copy that won a conflict). */
  post?: PostRow | null;
  errors?: Record<string, string>;
};

/**
 * POST /api/sync/push — body: { changes: PushChange[] }
 *
 * Applies a client's queued offline changes in order, inside one transaction.
 * Each change gets its own result, so one bad change does not fail the batch.
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body === INVALID_JSON) return errorResponse(400, "Invalid JSON body");

  const changes = (body as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(changes))
    return errorResponse(422, "Validation failed", {
      changes: "changes must be an array",
    });
  if (changes.length === 0 || changes.length > MAX_CHANGES)
    return errorResponse(422, "Validation failed", {
      changes: `changes must contain 1 to ${MAX_CHANGES} items`,
    });

  const results = await db.transaction(async (tx) => {
    const out: PushResult[] = [];
    for (const raw of changes) {
      const parsed = validatePushChange(raw);
      out.push(
        parsed.ok
          ? await apply(tx, parsed.data)
          : { id: parsed.id, status: "rejected", errors: parsed.errors },
      );
    }
    return out;
  });

  return NextResponse.json({
    data: results,
    meta: { serverTime: new Date().toISOString() },
  });
}

async function apply(tx: Tx, change: PushChange): Promise<PushResult> {
  const { id } = change;
  const posts = tx.orm.public.Post;
  const existing = await posts.where({ id }).forUpdate().first();

  if (!existing) {
    // Deleting a post the server never saw: nothing to do.
    if (change.op === "delete") return { id, status: "applied", post: null };
    const { title, content } = change;
    const post = await posts.create({ id, title, content });
    return { id, status: "applied", post };
  }

  // Deletes are final. A repeated delete is a no-op; an edit cannot bring a
  // tombstone back. Checked before the base version so a retried delete
  // (whose first attempt bumped updatedAt) is not reported as a conflict.
  if (existing.deletedAt) {
    const status = change.op === "delete" ? "applied" : "conflict";
    return { id, status, post: existing };
  }

  // The server already holds exactly this edit — typically a retry after the
  // first response was lost. Treat it as applied and skip the write so
  // updatedAt does not move.
  if (
    change.op === "upsert" &&
    existing.title === change.title &&
    existing.content === change.content
  ) {
    return { id, status: "applied", post: existing };
  }

  // The server copy changed after the version this edit was based on.
  if (
    change.baseUpdatedAt &&
    existing.updatedAt.getTime() > change.baseUpdatedAt.getTime()
  ) {
    return { id, status: "conflict", post: existing };
  }

  const post =
    change.op === "delete"
      ? await posts.where({ id }).update({ deletedAt: new Date() })
      : await posts
          .where({ id })
          .update({ title: change.title, content: change.content });
  return { id, status: "applied", post };
}
