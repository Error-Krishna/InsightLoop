import { AxiosError } from "axios";
import { toast } from "sonner";

/**
 * Standardized single error-message extraction convention for InsightLoop.
 * Extracts the user-meaningful error from Axios responses, Error instances, or fallbacks.
 */
export function getErrorMessage(error: unknown, fallback = "An unexpected error occurred"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      if ("detail" in data && typeof data.detail === "string" && data.detail.trim()) {
        return data.detail;
      }
      if ("message" in data && typeof data.message === "string" && data.message.trim()) {
        return data.message;
      }
      if ("error" in data && typeof data.error === "string" && data.error.trim()) {
        return data.error;
      }
    }
    if (error.message) return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

/**
 * Displays a standardized toast error using the single error-message convention.
 */
export function showErrorToast(error: unknown, fallback = "An unexpected error occurred"): string {
  const message = getErrorMessage(error, fallback);
  toast.error(message);
  return message;
}
