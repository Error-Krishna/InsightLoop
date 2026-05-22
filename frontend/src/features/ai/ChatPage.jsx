import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, Download, Navigation, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getAccessToken } from "../../lib/auth";
import { buildWsUrl } from "../../lib/ws";

const STARTER_PROMPTS = [
  "Export business trends",
  "Export worker management",
  "Show revenue trends",
  "Show worker productivity",
  "Export complete analytics",
];

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isError = message.type === "error";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600">
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white"
            : isError
            ? "border border-rose-200 bg-rose-50 text-rose-700"
            : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-100"
        }`}
      >
        {message.action === "download" && (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-emerald-600">
            <Download className="h-3.5 w-3.5" />
            Export ready – downloading…
          </div>
        )}
        {message.action === "navigate" && (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-600">
            <Navigation className="h-3.5 w-3.5" />
            Navigating…
          </div>
        )}
        {isError && (
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
            <AlertCircle className="h-3.5 w-3.5" /> Error
          </div>
        )}
        <p>{message.content}</p>
        {message.timestamp && (
          <p className={`mt-1 text-right text-[10px] ${isUser ? "text-blue-200" : "text-slate-400"}`}>
            {message.timestamp}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I'm your AI assistant. Ask me to export reports, show analytics, or navigate to any section.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const socket = new WebSocket(buildWsUrl("/ws/ai-assistant/"));
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => {
      toast.error("AI assistant connection failed");
      setConnected(false);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "session_status") return; // auth ack – ignore
        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: payload.content || payload.message || "Done.",
            type: payload.type,
            action: payload.action,
            timestamp: ts,
          },
        ]);

        if (payload.action === "navigate" && payload.url) {
          setTimeout(() => navigate(payload.url), 800);
        }
        if (payload.action === "download" && payload.file_url) {
          window.open(payload.file_url, "_blank");
        }
      } catch {
        // ignore malformed frames
      } finally {
        setSending(false);
      }
    };

    return () => socket.close();
  }, [navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(text) {
    const command = (text || input).trim();
    if (!command || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { role: "user", content: command, timestamp: ts }]);
    setInput("");
    setSending(true);
    socketRef.current.send(JSON.stringify({ command, assistant: "jarvis" }));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">AI Assistant</h1>
            <p className="text-xs text-blue-100">Ask for exports, insights, or navigation help</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
          <span className="text-xs text-blue-100">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {sending && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Starter prompts */}
      <div className="border-t border-slate-100 bg-white px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => send(prompt)}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              <Sparkles className="h-3 w-3" />
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 bg-white p-4">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Try: Export business trends…"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!input.trim() || !connected || sending}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}