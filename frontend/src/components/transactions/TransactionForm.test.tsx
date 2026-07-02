import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionForm, type TransactionFormData } from "./TransactionForm";

function noopPromise() {
  return Promise.resolve();
}

const defaultProps = {
  accounts: [
    { id: "acc-1", label: "Checking (personal)" },
    { id: "acc-2", label: "Savings (savings)" },
  ],
  getCategories: () => ["Food", "Transport", "Salary"],
  addCategory: async () => {},
  onSave: async (_data: TransactionFormData) => {},
  saving: false,
  error: "",
  submitLabel: "Create",
};

describe("TransactionForm - transfer mode", () => {
  it("should render the Account Transfer toggle", () => {
    render(<TransactionForm {...defaultProps} />);
    expect(screen.getByText("Account Transfer")).toBeInTheDocument();
  });

  it("should show target account dropdown when transfer is toggled on", () => {
    render(<TransactionForm {...defaultProps} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(screen.getByText("Target Account")).toBeInTheDocument();
    expect(screen.getByText("Select target account...")).toBeInTheDocument();
  });

  it("should hide target account dropdown when transfer is toggled off", () => {
    render(<TransactionForm {...defaultProps} />);
    const toggle = screen.getByRole("switch");
    // Turn on
    fireEvent.click(toggle);
    expect(screen.getByText("Target Account")).toBeInTheDocument();
    // Turn off
    fireEvent.click(toggle);
    expect(screen.queryByText("Target Account")).not.toBeInTheDocument();
  });

  it("should hide expense/income toggle when transfer mode is on", () => {
    render(<TransactionForm {...defaultProps} />);
    // Expense/income buttons should be visible initially
    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Should be hidden in transfer mode
    expect(screen.queryByText("Expense")).not.toBeInTheDocument();
    expect(screen.queryByText("Income")).not.toBeInTheDocument();
  });

  it("should hide category dropdown when transfer mode is on", () => {
    render(<TransactionForm {...defaultProps} />);
    expect(screen.getByText("Category")).toBeInTheDocument();

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    expect(screen.queryByText("Category")).not.toBeInTheDocument();
  });

  it("should auto-fill counterparty when target account is selected", () => {
    render(<TransactionForm {...defaultProps} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Select a target account — use getByDisplayValue to find the select containing "Select target account..."
    const targetSelect = screen.getByDisplayValue("Select target account...") as HTMLSelectElement;
    fireEvent.change(targetSelect, { target: { value: "acc-2" } });

    // Counterparty should be auto-filled
    const counterpartyInput = screen.getByDisplayValue("Checking (personal) → Savings (savings)") as HTMLInputElement;
    expect(counterpartyInput).toBeInTheDocument();
  });

  it("should disable submit button when target account is not selected in transfer mode", () => {
    render(<TransactionForm {...defaultProps} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Fill amount (first 0.00 input, the amount input)
    const amountInputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(amountInputs[0], { target: { value: "100" } });

    // Submit button should be disabled because target account is required
    const submitButton = screen.getByText("Create");
    expect(submitButton).toBeDisabled();
  });

  it("should enable submit button when all transfer fields are filled", () => {
    render(<TransactionForm {...defaultProps} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Fill amount (first 0.00 placeholder is the amount input)
    const amountInputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(amountInputs[0], { target: { value: "100" } });

    // Select target account
    const targetSelect = screen.getByDisplayValue("Select target account...");
    fireEvent.change(targetSelect, { target: { value: "acc-2" } });

    // Submit button should be enabled
    const submitButton = screen.getByText("Create");
    expect(submitButton).not.toBeDisabled();
  });

  it("should call onSave with transfer data when submitted in transfer mode", async () => {
    const onSaveMock = vi.fn().mockResolvedValue(undefined);
    render(<TransactionForm {...defaultProps} onSave={onSaveMock} />);

    // Enable transfer mode
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Fill amount
    const amountInputs = screen.getAllByPlaceholderText("0.00");
    fireEvent.change(amountInputs[0], { target: { value: "250" } });

    // Select target account
    const targetSelect = screen.getByDisplayValue("Select target account...");
    fireEvent.change(targetSelect, { target: { value: "acc-2" } });

    // Submit
    const submitButton = screen.getByText("Create");
    fireEvent.click(submitButton);

    // Wait for the async onSave
    await vi.waitFor(() => {
      expect(onSaveMock).toHaveBeenCalledTimes(1);
    });

    const callData = onSaveMock.mock.calls[0][0] as TransactionFormData;
    expect(callData.isTransfer).toBe(true);
    expect(callData.targetAccountId).toBe("acc-2");
    expect(callData.amount).toBe("250");
  });

  it("should hide Send to accordion when transfer mode is on", () => {
    render(<TransactionForm {...defaultProps} />);
    // Send to should be visible initially
    expect(screen.getByText("Send to")).toBeInTheDocument();

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Should be hidden in transfer mode
    expect(screen.queryByText("Send to")).not.toBeInTheDocument();
  });

  it("should pre-fill transfer fields from initialValues (edit mode)", () => {
    render(
      <TransactionForm
        {...defaultProps}
        initialValues={{
          isTransfer: true,
          targetAccountId: "acc-2",
          amount: "500",
          counterparty: "Checking → Savings",
          date: "2024-07-01",
        }}
      />,
    );

    // Transfer toggle should be on
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    // Target account should be visible and pre-filled
    const targetSelect = screen.getByDisplayValue("Savings (savings)") as HTMLSelectElement;
    expect(targetSelect.value).toBe("acc-2");

    // Amount should be pre-filled
    const amountInput = screen.getByDisplayValue("500");
    expect(amountInput).toBeInTheDocument();

    // Counterparty should be pre-filled
    const counterpartyInput = screen.getByDisplayValue("Checking (personal) → Savings (savings)");
    expect(counterpartyInput).toBeInTheDocument();
  });

  it("should show info text in transfer mode about amount crediting/dediting", () => {
    render(<TransactionForm {...defaultProps} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    expect(
      screen.getByText(/This amount will be deducted from the source account/)
    ).toBeInTheDocument();
  });
});
