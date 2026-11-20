"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, createPost, updatePost, type Post } from "@/lib/api";
import { Button, ButtonLink } from "./ui";

const field =
  "w-full rounded-md border bg-white px-3.5 py-2 text-sm outline-none focus:ring-1 dark:bg-zinc-900";
const ok =
  "border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100 dark:focus:ring-zinc-100";
const bad = "border-red-500 focus:border-red-500 focus:ring-red-500";

export function PostForm({ post }: { post?: Post }) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErrors({ title: "Title is required" });

    setSaving(true);
    setErrors({});
    const input = { title, content: content.trim() ? content : null };
    try {
      let saved;
      if (post) {
        saved = await updatePost(post.id, input);
      } else {
        saved = await createPost(input);
        // Next keeps visited routes alive (React <Activity>), so reset the
        // form; otherwise "New post" would reopen with the old draft.
        setTitle("");
        setContent("");
      }
      setSaving(false);
      router.push(`/posts/${saved.id}`);
    } catch (err) {
      const apiErr = err as ApiError;
      setErrors(
        Object.keys(apiErr.errors ?? {}).length
          ? apiErr.errors
          : { form: apiErr.message },
      );
      setSaving(false);
    }
  };

  const cancelHref = post ? `/posts/${post.id}` : "/";

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {errors.form && (
        <p className="rounded-md bg-red-50 px-3.5 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errors.form}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          autoFocus
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "title-error" : undefined}
          className={`${field} ${errors.title ? bad : ok}`}
        />
        {errors.title && (
          <p
            id="title-error"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {errors.title}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="content" className="text-sm font-medium">
          Content <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          aria-invalid={!!errors.content}
          className={`${field} resize-y ${errors.content ? bad : ok}`}
        />
        {errors.content && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {errors.content}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : post ? "Save changes" : "Create post"}
        </Button>
      </div>
    </form>
  );
}
