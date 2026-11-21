"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deletePost,
  formatDate,
  listPosts,
  type PostList as PostListResult,
} from "@/lib/api";
import { Button, Message, Skeleton } from "./ui";

type Result = { key: string; list?: PostListResult; error?: string };

export function PostList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const page = Math.max(1, Number(params.get("page")) || 1);
  const search = params.get("search") ?? "";

  const [query, setQuery] = useState(search);
  const [reloads, setReloads] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const navigate = (next: { page: number; search?: string }) => {
    const qs = new URLSearchParams();
    const s = next.search ?? search;
    if (s) qs.set("search", s);
    if (next.page > 1) qs.set("page", String(next.page));
    router.replace(qs.size ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounce typing into the URL; a new search always starts on page 1.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === search) return;
    const t = setTimeout(() => navigate({ search: trimmed, page: 1 }), 300);
    return () => clearTimeout(t);
  });

  const key = `${page}|${search}|${reloads}`;
  useEffect(() => {
    let cancelled = false;
    listPosts({ page, search })
      .then((list) => !cancelled && setResult({ key, list }))
      .catch((e: Error) => !cancelled && setResult({ key, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [key, page, search]);

  const loading = result?.key !== key;
  const list = result?.list;

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    setDeletingId(id);
    try {
      await deletePost(id);
      // Step back a page if we just removed the last item on it.
      if (list && list.data.length === 1 && page > 1)
        navigate({ page: page - 1 });
      else setReloads((n) => n + 1);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title…"
        aria-label="Search posts by title"
        className="w-full rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
      />

      {result?.error && !loading ? (
        <Message tone="error">{result.error}</Message>
      ) : !list ? (
        <Skeleton />
      ) : list.data.length === 0 ? (
        <Message>
          {search
            ? `No posts match "${search}".`
            : "No posts yet. Create your first one."}
        </Message>
      ) : (
        <ul
          className={`space-y-3 transition-opacity ${loading ? "opacity-50" : ""}`}
        >
          {list.data.map((post) => (
            <li
              key={post.id}
              className="group flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <Link href={`/posts/${post.id}`} className="min-w-0 flex-1">
                <h2 className="line-clamp-2 font-medium break-words">
                  {post.title}
                </h2>
                {post.content && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {post.content}
                  </p>
                )}
                <p className="mt-2 text-xs text-zinc-400">
                  {formatDate(post.createdAt)}
                </p>
              </Link>
              <div className="flex shrink-0 gap-1">
                <Link
                  href={`/posts/${post.id}/edit`}
                  className="rounded-md px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Edit
                </Link>
                <Button
                  variant="danger"
                  className="!px-2.5 !py-1.5 !font-normal"
                  disabled={deletingId === post.id}
                  onClick={() => onDelete(post.id, post.title)}
                >
                  {deletingId === post.id ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list && list.meta.totalPages > 1 && (
        <nav
          className="flex items-center justify-between text-sm"
          aria-label="Pagination"
        >
          <Button
            variant="secondary"
            disabled={page <= 1 || loading}
            onClick={() => navigate({ page: page - 1 })}
          >
            ← Previous
          </Button>
          <span className="text-zinc-500">
            Page {list.meta.page} of {list.meta.totalPages} · {list.meta.total}{" "}
            posts
          </span>
          <Button
            variant="secondary"
            disabled={page >= list.meta.totalPages || loading}
            onClick={() => navigate({ page: page + 1 })}
          >
            Next →
          </Button>
        </nav>
      )}
    </div>
  );
}
