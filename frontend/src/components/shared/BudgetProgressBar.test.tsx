import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetProgressBar } from "./BudgetProgressBar";

describe("BudgetProgressBar", () => {
  it("should render name and values", () => {
    render(
      <BudgetProgressBar name="Groceries" current={150} max={300} currency="USD" />,
    );
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("50% used")).toBeInTheDocument();
    expect(screen.getByText(/\$150\.00 remaining/)).toBeInTheDocument();
  });

  it("should render with EUR currency", () => {
    render(
      <BudgetProgressBar name="Rent" current={800} max={1000} currency="EUR" />,
    );
    expect(screen.getByText(/€800\.00/)).toBeInTheDocument();
    expect(screen.getByText(/€1000\.00/)).toBeInTheDocument();
    expect(screen.getByText("80% used")).toBeInTheDocument();
    expect(screen.getByText(/€200\.00 remaining/)).toBeInTheDocument();
  });

  it("should show destructive color at 100%", () => {
    render(
      <BudgetProgressBar name="Maxed" current={200} max={200} currency="USD" />,
    );
    expect(screen.getByText("100% used")).toBeInTheDocument();
    expect(screen.getByText(/\$0\.00 remaining/)).toBeInTheDocument();

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveClass("bg-destructive");
  });

  it("should show amber color at 80%+", () => {
    render(
      <BudgetProgressBar name="Warning" current={180} max={200} currency="USD" />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveClass("bg-amber-500");
  });

  it("should show income color between 50-79%", () => {
    render(
      <BudgetProgressBar name="Halfway" current={120} max={200} currency="USD" />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveClass("bg-income");
  });

  it("should show primary color below 50%", () => {
    render(
      <BudgetProgressBar name="Low" current={40} max={200} currency="USD" />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveClass("bg-primary");
  });

  it("should render compact variant", () => {
    render(
      <BudgetProgressBar name="Compact" current={50} max={100} compact />,
    );
    expect(screen.getByText("Compact")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
  });

  it("should handle zero max gracefully", () => {
    render(
      <BudgetProgressBar name="Zero" current={50} max={0} />,
    );
    expect(screen.getByText("0% used")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });

  it("should have correct ARIA attributes", () => {
    render(
      <BudgetProgressBar name="ARIA Test" current={75} max={100} />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "75");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-label", "ARIA Test: 75% used");
  });

  it("should render accountLabel and category pill", () => {
    render(
      <BudgetProgressBar
        name="Groceries"
        current={50}
        max={200}
        accountLabel="Checking"
        category="Food"
      />,
    );
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("(Checking)")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("should show 0% bar width when nothing is spent", () => {
    render(
      <BudgetProgressBar name="Empty" current={0} max={500} />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    // The style width should be 0, not 4
    expect(bar.style.width).toBe("0%");
  });
});
