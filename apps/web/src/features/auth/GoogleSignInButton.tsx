import { useEffect, useRef } from "react";
import { toast } from "sonner";
import api from "../../lib/api";
import { setSession, User } from "../../lib/auth";

interface GoogleAccountsId {
  initialize: (options: { client_id: string; callback: (res: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

export interface GoogleSignInSuccessData {
  tokens: {
    access: string;
    refresh: string;
  };
  user: User;
}

export interface GoogleSignInButtonProps {
  onSuccess?: (data: GoogleSignInSuccessData) => void;
}

export default function GoogleSignInButton({ onSuccess }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function handleCredential(response: { credential: string }) {
      try {
        const { data } = await api.post<GoogleSignInSuccessData>("/auth/google/", {
          credential: response.credential,
        });
        setSession({ access: data.tokens.access, refresh: data.tokens.refresh, user: data.user });
        toast.success("Welcome");
        onSuccess?.(data);
      } catch (error: unknown) {
        const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error(detail ?? "Google sign-in failed");
      }
    }

    function renderButton() {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          void handleCredential(response);
        },
      });
      const width = Math.min(buttonRef.current?.parentElement?.clientWidth || 360, 400);
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width,
      });
    }

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
  }, [clientId, onSuccess]);

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
