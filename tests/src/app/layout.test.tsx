import { render, screen } from "@testing-library/react";
import RootLayout from "@/app/layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({
    variable: "font-geist-sans",
    className: "font-geist-sans",
  }),
  Geist_Mono: () => ({
    variable: "font-geist-mono",
    className: "font-geist-mono",
  }),
}));

describe("RootLayout", () => {
  it("should renders children correctly", () => {
    render(
      <RootLayout params={Promise.resolve({})}>
        <div data-testid="child-content">Hello World</div>
      </RootLayout>,
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });
});
