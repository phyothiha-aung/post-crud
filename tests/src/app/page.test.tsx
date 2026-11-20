import { render, screen, waitFor } from "@testing-library/react";
import Home from "@/app/page";
import { seed, setupMockApi } from "../../mocks/api";
import { setNavigation } from "../../mocks/navigation";

vi.mock("next/navigation", () => import("../../mocks/navigation"));

setupMockApi();
beforeEach(() => setNavigation("/"));

describe("Home page", () => {
  it("renders the heading, new-post link and the post list", async () => {
    seed([{ title: "On the home page" }]);
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Posts" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ New post" })).toHaveAttribute(
      "href",
      "/posts/new",
    );
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("On the home page")).toBeInTheDocument(),
    );
  });
});
