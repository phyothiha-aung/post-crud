import { http, HttpResponse } from "msw/http";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostList } from "@/components/post-list";
import { formatDate } from "@/lib/api";
import { deferred, seed, server, store, setupMockApi } from "../../mocks/api";
import { router, setNavigation } from "../../mocks/navigation";

vi.mock("next/navigation", () => import("../../mocks/navigation"));

setupMockApi();

const items = () => screen.queryAllByRole("listitem");
const titles = () =>
  items().map((li) => within(li).getByRole("heading").textContent);
const confirmSpy = () => vi.spyOn(window, "confirm");

beforeEach(() => setNavigation("/"));
afterEach(() => vi.restoreAllMocks());

describe("PostList", () => {
  describe("loading and rendering", () => {
    it("shows a skeleton, then posts newest first", async () => {
      seed(3);
      render(<PostList />);

      expect(screen.getByLabelText("Loading")).toBeInTheDocument();
      await waitFor(() => expect(items()).toHaveLength(3));
      expect(titles()).toEqual(["Post 3", "Post 2", "Post 1"]);
      expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
    });

    it("renders each post's link, preview, date and actions", async () => {
      const [post] = seed([{ title: "Hello", content: "World" }]);
      render(<PostList />);

      const li = await screen.findByRole("listitem");
      const links = within(li).getAllByRole("link");
      expect(links[0]).toHaveAttribute("href", `/posts/${post.id}`);
      expect(within(li).getByText("World")).toBeInTheDocument();
      expect(
        within(li).getByText(formatDate(post.createdAt)),
      ).toBeInTheDocument();
      expect(within(li).getByRole("link", { name: "Edit" })).toHaveAttribute(
        "href",
        `/posts/${post.id}/edit`,
      );
      expect(within(li).getByRole("button", { name: "Delete" })).toBeEnabled();
    });

    it("omits the preview when a post has no content", async () => {
      seed([{ title: "Empty", content: null }]);
      render(<PostList />);
      const li = await screen.findByRole("listitem");
      expect(li.querySelectorAll("p")).toHaveLength(1); // date only
    });

    it("shows an empty state when there are no posts", async () => {
      render(<PostList />);
      expect(
        await screen.findByText("No posts yet. Create your first one."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });

    it("shows the API error message", async () => {
      server.use(
        http.get("/api/posts", () =>
          HttpResponse.json({ message: "Database down" }, { status: 500 }),
        ),
      );
      render(<PostList />);
      expect(await screen.findByText("Database down")).toBeInTheDocument();
    });
  });

  describe("search", () => {
    it("reads the initial search from the URL", async () => {
      seed([{ title: "React hooks" }, { title: "Vue" }]);
      setNavigation("/?search=react");
      render(<PostList />);

      expect(screen.getByRole("searchbox")).toHaveValue("react");
      await waitFor(() => expect(titles()).toEqual(["React hooks"]));
    });

    it("debounces typing into the URL and filters results", async () => {
      seed([
        { title: "React hooks" },
        { title: "Vue" },
        { title: "React server" },
      ]);
      render(<PostList />);
      await waitFor(() => expect(items()).toHaveLength(3));

      await userEvent.type(screen.getByRole("searchbox"), "react");
      expect(router.replace).not.toHaveBeenCalled(); // still debouncing

      await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
      expect(router.replace).toHaveBeenCalledWith("/?search=react", {
        scroll: false,
      });
      await waitFor(() =>
        expect(titles()).toEqual(["React server", "React hooks"]),
      );
    });

    it("trims the query and resets to page 1", async () => {
      seed(15);
      setNavigation("/?page=2");
      render(<PostList />);
      await waitFor(() => expect(items()).toHaveLength(5));

      await userEvent.type(screen.getByRole("searchbox"), "  post 1  ");
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith("/?search=post+1", {
          scroll: false,
        }),
      );
    });

    it("clears the search param when the input is emptied", async () => {
      setNavigation("/?search=abc");
      render(<PostList />);
      await userEvent.clear(screen.getByRole("searchbox"));
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith("/", { scroll: false }),
      );
    });

    it("does not navigate when only whitespace changes", async () => {
      setNavigation("/?search=abc");
      render(<PostList />);
      await userEvent.type(screen.getByRole("searchbox"), "   ");
      await new Promise((r) => setTimeout(r, 400));
      expect(router.replace).not.toHaveBeenCalled();
    });

    it("shows a no-match message", async () => {
      seed(2);
      setNavigation("/?search=zzz");
      render(<PostList />);
      expect(
        await screen.findByText('No posts match "zzz".'),
      ).toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("hides pagination when everything fits on one page", async () => {
      seed(10);
      render(<PostList />);
      await waitFor(() => expect(items()).toHaveLength(10));
      expect(
        screen.queryByRole("navigation", { name: "Pagination" }),
      ).not.toBeInTheDocument();
    });

    it("pages forward and back through the URL", async () => {
      seed(12);
      render(<PostList />);
      const nav = await screen.findByRole("navigation", { name: "Pagination" });

      expect(nav).toHaveTextContent("Page 1 of 2 · 12 posts");
      expect(
        within(nav).getByRole("button", { name: "← Previous" }),
      ).toBeDisabled();

      await userEvent.click(
        within(nav).getByRole("button", { name: "Next →" }),
      );
      expect(router.replace).toHaveBeenLastCalledWith("/?page=2", {
        scroll: false,
      });
      await waitFor(() => expect(nav).toHaveTextContent("Page 2 of 2"));
      expect(items()).toHaveLength(2);
      expect(
        within(nav).getByRole("button", { name: "Next →" }),
      ).toBeDisabled();

      await userEvent.click(
        within(nav).getByRole("button", { name: "← Previous" }),
      );
      expect(router.replace).toHaveBeenLastCalledWith("/", { scroll: false });
      await waitFor(() => expect(nav).toHaveTextContent("Page 1 of 2"));
    });

    it("keeps the search term when paging", async () => {
      seed(Array.from({ length: 12 }, (_, i) => ({ title: `Match ${i}` })));
      setNavigation("/?search=match");
      render(<PostList />);
      await userEvent.click(
        await screen.findByRole("button", { name: "Next →" }),
      );
      expect(router.replace).toHaveBeenLastCalledWith("/?search=match&page=2", {
        scroll: false,
      });
    });

    it.each(["abc", "0", "-3"])("treats page=%s as page 1", async (page) => {
      seed(12);
      setNavigation(`/?page=${page}`);
      render(<PostList />);
      expect(await screen.findByRole("navigation")).toHaveTextContent(
        "Page 1 of 2",
      );
    });

    it("dims the list and disables paging while the next page loads", async () => {
      seed(12);
      render(<PostList />);
      const next = await screen.findByRole("button", { name: "Next →" });

      const gate = deferred();
      server.use(
        http.get("/api/posts", async () => {
          await gate.promise;
          return HttpResponse.json({
            data: [],
            meta: {
              page: 2,
              limit: 10,
              total: 12,
              totalPages: 2,
              search: null,
            },
          });
        }),
      );
      await userEvent.click(next);

      expect(screen.getByRole("list")).toHaveClass("opacity-50");
      expect(next).toBeDisabled();
      expect(screen.getByRole("button", { name: "← Previous" })).toBeDisabled();

      gate.resolve();
      await waitFor(() =>
        expect(screen.queryByRole("list")).not.toBeInTheDocument(),
      );
    });
  });

  describe("delete", () => {
    it("does nothing when the confirm dialog is cancelled", async () => {
      seed(2);
      const confirm = confirmSpy().mockReturnValue(false);
      render(<PostList />);
      await waitFor(() => expect(items()).toHaveLength(2));

      await userEvent.click(
        within(items()[0]).getByRole("button", { name: "Delete" }),
      );
      expect(confirm).toHaveBeenCalledWith(
        `Delete "Post 2"? This can't be undone.`,
      );
      expect(store.posts).toHaveLength(2);
      expect(items()).toHaveLength(2);
    });

    it("deletes after confirming and reloads the list", async () => {
      seed(2);
      confirmSpy().mockReturnValue(true);
      render(<PostList />);
      await waitFor(() => expect(items()).toHaveLength(2));

      await userEvent.click(
        within(items()[0]).getByRole("button", { name: "Delete" }),
      );
      await waitFor(() => expect(titles()).toEqual(["Post 1"]));
      expect(store.posts.map((p) => p.id)).toEqual(["1"]);
      expect(router.replace).not.toHaveBeenCalled();
    });

    it("shows a pending state while deleting", async () => {
      seed(1);
      confirmSpy().mockReturnValue(true);
      const gate = deferred();
      server.use(
        http.delete("/api/posts/:id", async () => {
          await gate.promise;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      render(<PostList />);
      await userEvent.click(
        await screen.findByRole("button", { name: "Delete" }),
      );

      expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
      gate.resolve();
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Deleting…" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("goes back a page after deleting the last post on it", async () => {
      seed(11);
      confirmSpy().mockReturnValue(true);
      setNavigation("/?page=2");
      render(<PostList />);
      await waitFor(() => expect(items()).toHaveLength(1));

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith("/", { scroll: false }),
      );
      await waitFor(() => expect(items()).toHaveLength(10));
    });

    it("alerts and re-enables the button when the delete fails", async () => {
      seed(1);
      confirmSpy().mockReturnValue(true);
      const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
      server.use(
        http.delete("/api/posts/:id", () =>
          HttpResponse.json({ message: "Nope" }, { status: 500 }),
        ),
      );
      render(<PostList />);
      await userEvent.click(
        await screen.findByRole("button", { name: "Delete" }),
      );

      await waitFor(() => expect(alert).toHaveBeenCalledWith("Nope"));
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
      expect(items()).toHaveLength(1);
    });
  });
});
