import { render, screen } from "@testing-library/react";
import NewPostPage, { metadata } from "@/app/posts/new/page";
import { setNavigation } from "../../../../mocks/navigation";

vi.mock("next/navigation", () => import("../../../../mocks/navigation"));

beforeEach(() => setNavigation("/posts/new"));

describe("New post page", () => {
  it("renders a back link, heading and empty form", () => {
    render(<NewPostPage />);
    expect(screen.getByRole("link", { name: "← All posts" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("heading", { name: "New post" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Create post" }),
    ).toBeInTheDocument();
  });

  it("sets the page title", () => {
    expect(metadata.title).toBe("New post");
  });
});
