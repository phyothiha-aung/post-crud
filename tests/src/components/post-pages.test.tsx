import { http, HttpResponse } from "msw/http";
import { render, screen, waitFor } from "@testing-library/react";
import { RoutePostDetail, RoutePostEditForm } from "@/components/post-pages";
import { WithRoutePost } from "@/components/post-loader";
import { deferred, seed, server, setupMockApi } from "../../mocks/api";
import { setNavigation } from "../../mocks/navigation";

vi.mock("next/navigation", () => import("../../mocks/navigation"));

setupMockApi();

describe("WithRoutePost", () => {
  const renderTitle = vi.fn((post: { title: string }) => (
    <p>Loaded: {post.title}</p>
  ));
  // Braces matter: a function returned from beforeEach is run as teardown.
  beforeEach(() => {
    renderTitle.mockClear();
  });

  it("shows a skeleton, then renders the post for the route id", async () => {
    const [post] = seed([{ title: "Routed" }]);
    setNavigation(`/posts/${post.id}`, { id: String(post.id) });
    render(<WithRoutePost render={renderTitle} />);

    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(await screen.findByText("Loaded: Routed")).toBeInTheDocument();
    expect(renderTitle).toHaveBeenCalledWith(
      expect.objectContaining({ id: post.id }),
    );
  });

  it.each([
    ["missing", "42"],
    ["invalid", "abc"],
  ])("shows 'Post not found.' for a %s id", async (_, id) => {
    setNavigation(`/posts/${id}`, { id });
    render(<WithRoutePost render={renderTitle} />);
    expect(await screen.findByText("Post not found.")).toBeInTheDocument();
    expect(renderTitle).not.toHaveBeenCalled();
  });

  it("shows other API errors as-is", async () => {
    server.use(
      http.get("/api/posts/:id", () =>
        HttpResponse.json({ message: "Timeout" }, { status: 504 }),
      ),
    );
    setNavigation("/posts/1", { id: "1" });
    render(<WithRoutePost render={renderTitle} />);
    expect(await screen.findByText("Timeout")).toBeInTheDocument();
  });

  it("loads the new post when the route id changes", async () => {
    seed([{ title: "First" }, { title: "Second" }]);
    setNavigation("/posts/1", { id: "1" });
    const { rerender } = render(<WithRoutePost render={renderTitle} />);
    expect(await screen.findByText("Loaded: First")).toBeInTheDocument();

    setNavigation("/posts/2", { id: "2" });
    rerender(<WithRoutePost render={renderTitle} />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument(); // never shows stale post
    expect(await screen.findByText("Loaded: Second")).toBeInTheDocument();
  });

  it("ignores a response that arrives after unmount", async () => {
    const gate = deferred();
    const consoleError = vi.spyOn(console, "error");
    server.use(
      http.get("/api/posts/:id", async () => {
        await gate.promise;
        return HttpResponse.json({ data: seed(1)[0] });
      }),
    );
    setNavigation("/posts/1", { id: "1" });
    const { unmount } = render(<WithRoutePost render={renderTitle} />);
    unmount();
    gate.resolve();
    await new Promise((r) => setTimeout(r, 50));
    expect(renderTitle).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("ignores an error that arrives after unmount", async () => {
    const gate = deferred();
    server.use(
      http.get("/api/posts/:id", async () => {
        await gate.promise;
        return HttpResponse.json({ message: "late" }, { status: 500 });
      }),
    );
    setNavigation("/posts/1", { id: "1" });
    const { unmount } = render(<WithRoutePost render={renderTitle} />);
    unmount();
    gate.resolve();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("late")).not.toBeInTheDocument();
  });
});

describe("RoutePostDetail", () => {
  it("renders the post detail for the route", async () => {
    seed([{ title: "Detail me", content: "Body" }]);
    setNavigation("/posts/1", { id: "1" });
    render(<RoutePostDetail />);
    expect(
      await screen.findByRole("heading", { name: "Detail me" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });
});

describe("RoutePostEditForm", () => {
  it("renders the form prefilled with the route's post", async () => {
    seed([{ title: "Edit me", content: "Body" }]);
    setNavigation("/posts/1/edit", { id: "1" });
    render(<RoutePostEditForm />);
    await waitFor(() =>
      expect(screen.getByLabelText("Title")).toHaveValue("Edit me"),
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });
});
