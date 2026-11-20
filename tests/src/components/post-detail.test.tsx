import { http, HttpResponse } from "msw/http";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostDetail } from "@/components/post-detail";
import { formatDate } from "@/lib/api";
import { deferred, seed, server, store, setupMockApi } from "../../mocks/api";
import { router, setNavigation } from "../../mocks/navigation";

vi.mock("next/navigation", () => import("../../mocks/navigation"));

setupMockApi();
beforeEach(() => setNavigation("/posts/1"));
afterEach(() => vi.restoreAllMocks());

const deleteButton = () => screen.getByRole("button", { name: /Delet/ });

describe("PostDetail", () => {
  it("renders the title, date, content and edit link", () => {
    const [post] = seed([{ title: "Hello", content: "Line one\nLine two" }]);
    render(<PostDetail post={post} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Hello",
    );
    expect(screen.getByText(formatDate(post.createdAt))).toBeInTheDocument();
    expect(screen.getByText(/Line one/)).toHaveTextContent(
      "Line one Line two",
      {
        normalizeWhitespace: true,
      },
    );
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/posts/${post.id}/edit`,
    );
  });

  it("shows a placeholder when there is no content", () => {
    const [post] = seed([{ content: null }]);
    render(<PostDetail post={post} />);
    expect(screen.getByText("No content.")).toBeInTheDocument();
  });

  it("only shows the edited date when the post was updated", () => {
    const [fresh] = seed(1);
    const { unmount } = render(<PostDetail post={fresh} />);
    expect(screen.queryByText(/Edited/)).not.toBeInTheDocument();
    unmount();

    const edited = { ...fresh, updatedAt: "2026-06-01T12:00:00.000Z" };
    render(<PostDetail post={edited} />);
    expect(
      screen.getByText(new RegExp(`Edited ${formatDate(edited.updatedAt)}`)),
    ).toBeInTheDocument();
  });

  it("does nothing when delete is not confirmed", async () => {
    const [post] = seed(1);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PostDetail post={post} />);

    await userEvent.click(deleteButton());
    expect(confirm).toHaveBeenCalledWith(
      `Delete "${post.title}"? This can't be undone.`,
    );
    expect(store.posts).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("deletes after confirming and returns to the list", async () => {
    const [post] = seed(1);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const gate = deferred();
    server.use(
      http.delete("/api/posts/:id", async () => {
        await gate.promise;
        store.posts = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<PostDetail post={post} />);

    await userEvent.click(deleteButton());
    expect(deleteButton()).toHaveTextContent("Deleting…");
    expect(deleteButton()).toBeDisabled();

    gate.resolve();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
    expect(store.posts).toHaveLength(0);
  });

  it("alerts and re-enables delete when it fails", async () => {
    const [post] = seed(1);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    server.use(
      http.delete("/api/posts/:id", () =>
        HttpResponse.json({ message: "Locked" }, { status: 409 }),
      ),
    );
    render(<PostDetail post={post} />);

    await userEvent.click(deleteButton());
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Locked"));
    expect(deleteButton()).toHaveTextContent("Delete");
    expect(deleteButton()).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
