export type Post = {
  id: number;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PostList = {
  data: Post[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    search: string | null;
  };
};

export type PostInput = { title: string; content: string | null };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      res.status,
      body.message ?? "Something went wrong",
      body.errors,
    );
  return body as T;
}

export function listPosts({
  page,
  search,
  limit = 10,
}: {
  page: number;
  search: string;
  limit?: number;
}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) qs.set("search", search);
  return request<PostList>(`/api/posts?${qs}`);
}

export const getPost = (id: string) =>
  request<{ data: Post }>(`/api/posts/${id}`).then((r) => r.data);

export const createPost = (input: PostInput) =>
  request<{ data: Post }>("/api/posts", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.data);

export const updatePost = (id: number, input: PostInput) =>
  request<{ data: Post }>(`/api/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  }).then((r) => r.data);

export const deletePost = (id: number) =>
  request<void>(`/api/posts/${id}`, { method: "DELETE" });

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
