"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePost, formatDate, type Post } from "@/lib/api";
import { Button, ButtonLink } from "./ui";

export function PostDetail({ post }: { post: Post }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const onDelete = async () => {
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deletePost(post.id);
      router.push("/");
    } catch (e) {
      alert((e as Error).message);
      setDeleting(false);
    }
  };

  const edited = post.updatedAt !== post.createdAt;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {post.title}
        </h1>
        <p className="text-sm text-zinc-500">
          {formatDate(post.createdAt)}
          {edited && ` · Edited ${formatDate(post.updatedAt)}`}
        </p>
      </header>

      {post.content ? (
        <div className="whitespace-pre-wrap break-words leading-relaxed text-zinc-700 dark:text-zinc-300">
          {post.content}
        </div>
      ) : (
        <p className="text-zinc-400 italic">No content.</p>
      )}

      <footer className="flex gap-2 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <ButtonLink href={`/posts/${post.id}/edit`} variant="secondary">
          Edit
        </ButtonLink>
        <Button variant="danger" onClick={onDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </footer>
    </article>
  );
}
