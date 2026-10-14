import { useEffect, useRef } from "react";
import { toast } from "sonner";
import api from "../../lib/api";
import { setSession } from "../../lib/auth";

/**
 * Renders Google's own "Sign in with Google" button (via Google Identity
 * Services' JS SDK, loaded in index.html) and handles the resulting ID
 * token: sends it to the backend's /auth/google/ endpoint, which verifies
 * it and returns the same {tokens, user} shape as email/password login.
 *
 * If VITE_GOOGLE_CLIENT_ID isn't set, this renders nothing rather than a
 * broken button -- Google sign-in is optional, not a hard requirement to
 * use the app.
 */
export default function GoogleSignInButton({ onSuccess }) {
  const buttonRef = useRef(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    let timeoutId = null;

    async function handleCredential(response) {
      try {
        const { data } = await api.post("/auth/google/", { credential: response.credential });
        setSession({ access: data.tokens.access, refresh: data.tokens.refresh, user: data.user });
        toast.success("Welcome");
        onSuccess?.(data);
      } catch (error) {
        toast.error(error.response?.data?.detail || "Google sign-in failed");
      }
    }

    function renderButton() {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      });
      const width = Math.min(buttonRef.current?.parentElement?.clientWidth || 360, 400);
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width,
      });
    }

    // Google's script (loaded in index.html) may not have finished loading
    // yet by the time this component mounts, so poll briefly rather than
    // assuming window.google is already present.
    if (window.google?.accounts?.id) {
      renderButton();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          renderButton();
        }
      }, 200);
      timeoutId = setTimeout(() => clearInterval(interval), 10000);
      return () => {
        cancelled = true;
        clearInterval(interval);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        or
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div ref={buttonRef} className="flex w-full justify-center" />
    </div>
  );
}
