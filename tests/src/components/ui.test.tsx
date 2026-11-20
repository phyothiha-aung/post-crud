import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BackLink,
  Button,
  ButtonLink,
  Message,
  Skeleton,
} from "@/components/ui";

describe("Button", () => {
  it("renders a primary button by default and handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("bg-zinc-900");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each([
    ["secondary", "border-zinc-300"],
    ["danger", "text-red-600"],
  ] as const)("applies the %s variant", (variant, cls) => {
    render(<Button variant={variant}>X</Button>);
    expect(screen.getByRole("button")).toHaveClass(cls);
  });

  it("forwards native props and merges className", async () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" disabled className="extra" onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeDisabled();
    expect(button).toHaveClass("extra");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("ButtonLink", () => {
  it("renders a styled link", () => {
    render(
      <ButtonLink href="/posts/new" variant="secondary" className="extra">
        New
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "New" });
    expect(link).toHaveAttribute("href", "/posts/new");
    expect(link).toHaveClass("border-zinc-300", "extra");
  });

  it("defaults to the primary variant", () => {
    render(<ButtonLink href="/">Home</ButtonLink>);
    expect(screen.getByRole("link")).toHaveClass("bg-zinc-900");
  });
});

describe("Message", () => {
  it("renders a muted message by default", () => {
    render(<Message>Nothing here</Message>);
    expect(screen.getByText("Nothing here")).toHaveClass("text-zinc-500");
  });

  it("renders an error message", () => {
    render(<Message tone="error">Broken</Message>);
    expect(screen.getByText("Broken")).toHaveClass("text-red-700");
  });
});

describe("Skeleton", () => {
  it("renders three placeholder rows by default", () => {
    render(<Skeleton />);
    const skeleton = screen.getByLabelText("Loading");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton.children).toHaveLength(3);
  });

  it("renders the requested number of rows", () => {
    render(<Skeleton rows={1} />);
    expect(screen.getByLabelText("Loading").children).toHaveLength(1);
  });
});

describe("BackLink", () => {
  it("renders a link with a back arrow", () => {
    render(<BackLink href="/">All posts</BackLink>);
    const link = screen.getByRole("link", { name: "← All posts" });
    expect(link).toHaveAttribute("href", "/");
  });
});
