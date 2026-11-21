import { http, HttpResponse } from "msw/http";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostForm } from "@/components/post-form";
import {
  deferred,
  makePost,
  seed,
  server,
  store,
  setupMockApi,
} from "../../mocks/api";
import { router, setNavigation } from "../../mocks/navigation";

vi.mock("next/navigation", () => import("../../mocks/navigation"));

setupMockApi();
beforeEach(() => setNavigation("/posts/new"));

const title = () => screen.getByLabelText("Title");
const content = () => screen.getByLabelText(/Content/);

/** Capture the JSON body of the next request to `method path`. */
function captureBody(method: "post" | "put", path: string) {
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (
      request.method === method.toUpperCase() &&
      new URL(request.url).pathname === path
    )
      bodies.push(await request.clone().json());
  });
  return bodies;
}
afterEach(() => server.events.removeAllListeners());

describe("PostForm (create)", () => {
  it("renders empty fields, a focused title and a cancel link home", () => {
    render(<PostForm />);
    expect(title()).toHaveValue("");
    expect(title()).toHaveFocus();
    expect(content()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create post" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("requires a title before sending anything", async () => {
    const bodies = captureBody("post", "/api/posts");
    render(<PostForm />);

    await userEvent.type(title(), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));

    expect(screen.getByText("Title is required")).toHaveAttribute(
      "id",
      "title-error",
    );
    expect(title()).toHaveAttribute("aria-invalid", "true");
    expect(title()).toHaveAttribute("aria-describedby", "title-error");
    expect(bodies).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("creates the post, resets the form and opens the new post", async () => {
    const bodies = captureBody("post", "/api/posts");
    render(<PostForm />);

    await userEvent.type(title(), "Hello");
    await userEvent.type(content(), "World");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/posts/1"));
    expect(bodies).toEqual([{ title: "Hello", content: "World" }]);
    expect(store.posts[0]).toMatchObject({ title: "Hello", content: "World" });
    expect(title()).toHaveValue("");
    expect(content()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create post" })).toBeEnabled();
  });

  it("sends null content when content is blank", async () => {
    const bodies = captureBody("post", "/api/posts");
    render(<PostForm />);
    await userEvent.type(title(), "Only title");
    await userEvent.type(content(), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(bodies).toEqual([{ title: "Only title", content: null }]);
  });

  it("shows a saving state while the request is in flight", async () => {
    const gate = deferred();
    server.use(
      http.post("/api/posts", async () => {
        await gate.promise;
        return HttpResponse.json({ data: makePost() }, { status: 201 });
      }),
    );
    render(<PostForm />);
    await userEvent.type(title(), "Slow");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    gate.resolve();
    await waitFor(() => expect(router.push).toHaveBeenCalled());
  });

  it("shows field errors returned by the API and keeps the input", async () => {
    server.use(
      http.post("/api/posts", () =>
        HttpResponse.json(
          {
            message: "Validation failed",
            errors: { title: "Title taken", content: "Too spicy" },
          },
          { status: 422 },
        ),
      ),
    );
    render(<PostForm />);
    await userEvent.type(title(), "Dup");
    await userEvent.type(content(), "Body");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));

    expect(await screen.findByText("Title taken")).toBeInTheDocument();
    expect(screen.getByText("Too spicy")).toBeInTheDocument();
    expect(content()).toHaveAttribute("aria-invalid", "true");
    expect(title()).toHaveValue("Dup");
    expect(screen.getByRole("button", { name: "Create post" })).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a form-level error when the API gives no field errors", async () => {
    server.use(
      http.post("/api/posts", () =>
        HttpResponse.json({ message: "Server exploded" }, { status: 500 }),
      ),
    );
    render(<PostForm />);
    await userEvent.type(title(), "Boom");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));

    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
    expect(title()).toHaveAttribute("aria-invalid", "false");
  });

  it("shows a form-level error when the network request fails", async () => {
    server.use(http.post("/api/posts", () => HttpResponse.error()));
    render(<PostForm />);
    await userEvent.type(title(), "Offline");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));

    // Message comes from the runtime: "fetch failed" (Node) / "Failed to fetch" (browsers).
    expect(
      await screen.findByText(/fetch failed|failed to fetch/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create post" })).toBeEnabled();
  });

  it("clears previous errors on the next submit", async () => {
    render(<PostForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));
    expect(screen.getByText("Title is required")).toBeInTheDocument();

    await userEvent.type(title(), "Fixed");
    await userEvent.click(screen.getByRole("button", { name: "Create post" }));
    expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
    await waitFor(() => expect(router.push).toHaveBeenCalled());
  });
});

describe("PostForm (edit)", () => {
  it("prefills the post and links cancel back to it", () => {
    const [post] = seed([{ title: "Existing", content: "Old body" }]);
    render(<PostForm post={post} />);

    expect(title()).toHaveValue("Existing");
    expect(content()).toHaveValue("Old body");
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      `/posts/${post.id}`,
    );
  });

  it("treats null content as empty", () => {
    const [post] = seed([{ content: null }]);
    render(<PostForm post={post} />);
    expect(content()).toHaveValue("");
  });

  it("PUTs the changes, opens the post and keeps the edited values", async () => {
    const [post] = seed([{ title: "Existing", content: "Old body" }]);
    const bodies = captureBody("put", `/api/posts/${post.id}`);
    render(<PostForm post={post} />);

    await userEvent.clear(title());
    await userEvent.type(title(), "Renamed");
    await userEvent.clear(content());
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/posts/${post.id}`),
    );
    expect(bodies).toEqual([{ title: "Renamed", content: null }]);
    expect(store.posts[0]).toMatchObject({ title: "Renamed", content: null });
    expect(title()).toHaveValue("Renamed");
  });

  it("shows an error when the post no longer exists", async () => {
    const post = makePost({ id: "99" });
    render(<PostForm post={post} />);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Post not found")).toBeInTheDocument();
  });
});
