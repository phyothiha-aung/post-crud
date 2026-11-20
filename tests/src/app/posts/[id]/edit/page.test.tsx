import { render, screen, waitFor } from "@testing-library/react";
import EditPostPage, { metadata } from "@/app/posts/[id]/edit/page";
import { seed, setupMockApi } from "../../../../../mocks/api";
import { setNavigation } from "../../../../../mocks/navigation";

vi.mock("next/navigation", () => import("../../../../../mocks/navigation"));

setupMockApi();

describe("Edit post page", () => {
  it("renders a back link, heading and the prefilled form", async () => {
    seed([{ title: "Editable" }]);
    setNavigation("/posts/1/edit", { id: "1" });
    render(<EditPostPage />);

    expect(screen.getByRole("link", { name: "← All posts" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("heading", { name: "Edit post" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Title")).toHaveValue("Editable"),
    );
  });

  it("sets the page title", () => {
    expect(metadata.title).toBe("Edit post");
  });
});
