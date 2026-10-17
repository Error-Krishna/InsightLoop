import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UploadPage from "../../src/features/upload/UploadPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("UploadPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders CSV upload area and manual entry form", () => {
    render(<UploadPage />);
    expect(screen.getByRole("heading", { name: "CSV Upload" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manual Entry" })).toBeInTheDocument();
  });

  it("empty state handles submitting CSV upload with no file selected", () => {
    render(<UploadPage />);
    const uploadBtn = screen.getByRole("button", { name: /Upload CSV/i });
    fireEvent.click(uploadBtn);

    expect(toast.error).toHaveBeenCalledWith("Please choose a CSV file first");
  });

  it("error state handles CSV upload API rejection", async () => {
    const error: any = new Error("Upload failed");
    error.response = { status: 400, data: { detail: "Missing required columns in CSV" } };
    vi.spyOn(api, "post").mockRejectedValueOnce(error);

    render(<UploadPage />);

    const file = new File(["col1,col2\nval1,val2"], "invalid.csv", { type: "text/csv" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });
    }

    const uploadBtn = screen.getByRole("button", { name: /Upload CSV/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Missing required columns in CSV");
    });
  });

  it("success state saves manual entry record", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: { id: "data-1", created: true } });

    render(<UploadPage />);

    const productInput = screen.getByRole("textbox", { name: /Product/i });
    fireEvent.change(productInput, { target: { value: "Silk Stoles" } });

    const form = productInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Manual record saved");
    });
  });
});
