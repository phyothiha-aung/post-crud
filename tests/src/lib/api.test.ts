import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createPost,
  deletePost,
  formatDate,
  getPost,
  listPosts,
  updatePost,
  type Post,
} from "@/lib/api";

const post: Post = {
  id: "1",
  title: "Hello",
  content: "World",
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
  deletedAt: null,
};

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** URL and init of the single fetch call made by the function under test. */
const lastCall = () => {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  return { url: String(url), init: init ?? {} };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listPosts", () => {
  const list = {
    data: [post],
    meta: { page: 2, limit: 5, total: 6, totalPages: 2, search: "he" },
  };

  it("requests page, limit and search and returns the whole payload", async () => {
    fetchMock.mockResolvedValue(json(list));

    await expect(
      listPosts({ page: 2, limit: 5, search: "he" }),
    ).resolves.toEqual(list);

    const { url, init } = lastCall();
    expect(url).toBe("/api/posts?page=2&limit=5&search=he");
    expect(init.method).toBeUndefined(); // GET
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("defaults limit to 10 and omits an empty search", async () => {
    fetchMock.mockResolvedValue(json(list));
    await listPosts({ page: 1, search: "" });
    expect(lastCall().url).toBe("/api/posts?page=1&limit=10");
  });

  it("URL-encodes the search term", async () => {
    fetchMock.mockResolvedValue(json(list));
    await listPosts({ page: 1, search: "100% a&b" });
    const qs = new URL(lastCall().url, "http://x").searchParams;
    expect(qs.get("search")).toBe("100% a&b");
  });
});

describe("getPost", () => {
  it("fetches by id and unwraps data", async () => {
    fetchMock.mockResolvedValue(json({ data: post }));
    await expect(getPost("1")).resolves.toEqual(post);
    expect(lastCall().url).toBe("/api/posts/1");
  });
});

describe("createPost", () => {
  it("POSTs the input as JSON and unwraps data", async () => {
    fetchMock.mockResolvedValue(json({ data: post }, 201));
    const input = { title: "Hello", content: null };

    await expect(createPost(input)).resolves.toEqual(post);

    const { url, init } = lastCall();
    expect(url).toBe("/api/posts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });
});

describe("updatePost", () => {
  it("PUTs the input to the post URL and unwraps data", async () => {
    fetchMock.mockResolvedValue(json({ data: post }));
    const input = { title: "Changed", content: "Body" };

    await expect(updatePost("7", input)).resolves.toEqual(post);

    const { url, init } = lastCall();
    expect(url).toBe("/api/posts/7");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });
});

describe("deletePost", () => {
  it("sends DELETE and resolves undefined on 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deletePost("3")).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(url).toBe("/api/posts/3");
    expect(init.method).toBe("DELETE");
  });
});

describe("error handling", () => {
  it("throws ApiError with status, message and field errors", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          message: "Validation failed",
          errors: { title: "Title is required" },
        },
        422,
      ),
    );

    const err = await createPost({ title: "", content: null }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      status: 422,
      message: "Validation failed",
      errors: { title: "Title is required" },
    });
  });

  it("defaults errors to an empty object when the server sends none", async () => {
    fetchMock.mockResolvedValue(json({ message: "Post not found" }, 404));
    const err = await getPost("999").catch((e) => e);
    expect(err).toMatchObject({
      status: 404,
      message: "Post not found",
      errors: {},
    });
  });

  it("uses a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>502</html>", { status: 502 }),
    );
    const err = await getPost("1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, message: "Something went wrong" });
  });

  it("propagates network failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getPost("1")).rejects.toThrow("Failed to fetch");
  });
});

describe("ApiError", () => {
  it("stores status, message and errors", () => {
    const err = new ApiError(400, "Bad", { id: "Invalid" });
    expect(err.status).toBe(400);
    expect(err.message).toBe("Bad");
    expect(err.errors).toEqual({ id: "Invalid" });
  });
});

describe("formatDate", () => {
  it("formats an ISO string with medium date and short time in the current locale", () => {
    const iso = "2026-11-20T10:30:00.000Z";
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

    expect(formatDate(iso)).toBe(expected);
    expect(formatDate(iso)).toMatch(/2026/);
  });

  it("throws on an invalid date", () => {
    expect(() => formatDate("not a date")).toThrow(RangeError);
  });
});
