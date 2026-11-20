import { render, screen } from "@testing-library/react";
import PostPage from "@/app/posts/[id]/page";
import { seed, setupMockApi } from "../../../../mocks/api";
import { setNavigation } from "../../../../mocks/navigation";

vi.mock("next/navigation", () => import("../../../../mocks/navigation"));

setupMockApi();

describe("Post page", () => {
  it("renders a back link and the post", async () => {
    seed([{ title: "Shown on its page" }]);
    setNavigation("/posts/1", { id: "1" });
    render(<PostPage />);

    expect(screen.getByRole("link", { name: "← All posts" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      await screen.findByRole("heading", { name: "Shown on its page" }),
    ).toBeInTheDocument();
  });
});
