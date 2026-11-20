import { NextResponse } from "next/server";

export type PostInput = { title: string; content: string | null };

type ValidationResult<T> =
  { ok: true; data: T } | { ok: false; errors: Record<string, string> };

/**
 * Validate a post payload. With `partial`, every field is optional
 * (used by PATCH), but any field that is present must still be valid.
 */
export function validatePostInput(
  body: unknown,
  { partial = false }: { partial?: boolean } = {},
): ValidationResult<Partial<PostInput>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      errors: { body: "Request body must be a JSON object" },
    };
  }

  const { title, content } = body as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const data: Partial<PostInput> = {};

  if (title === undefined) {
    if (!partial) errors.title = "Title is required";
  } else if (typeof title !== "string" || title.trim() === "") {
    errors.title = "Title must be a non-empty string";
  } else if (title.length > 255) {
    errors.title = "Title must be at most 255 characters";
  } else {
    data.title = title.trim();
  }

  if (content !== undefined) {
    if (content !== null && typeof content !== "string") {
      errors.content = "Content must be a string or null";
    } else {
      data.content = content;
    }
  }

  if (
    partial &&
    Object.keys(errors).length === 0 &&
    Object.keys(data).length === 0
  ) {
    errors.body = "Provide at least one of: title, content";
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, data };
}

/** Parse a route `[id]` segment into a positive integer, or null. */
export function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

/** Read a positive integer query param, falling back to a default and clamping to max. */
export function parsePositiveInt(
  raw: string | null,
  fallback: number,
  max = Infinity,
): number {
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n < 1 ? fallback : Math.min(n, max);
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function readJson(
  req: Request,
): Promise<unknown | typeof INVALID_JSON> {
  try {
    return await req.json();
  } catch {
    return INVALID_JSON;
  }
}
export const INVALID_JSON = Symbol("invalid-json");

export const errorResponse = (
  status: number,
  message: string,
  errors?: Record<string, string>,
) => NextResponse.json({ message, ...(errors && { errors }) }, { status });
