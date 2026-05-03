import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Card from "../../components/Card";

export default function ChatPage() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [command, setCommand] = useState("");

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/ai-assistant/`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setMessages((current) => [...current, payload]);
      if (payload.action === "navigate" && payload.url) {
        navigate(payload.url);
      }
      if (payload.action === "download" && payload.file_url) {
        window.open(payload.file_url, "_blank");
      }
    };

    socket.onerror = () => toast.error("AI assistant connection failed");
    return () => socket.close();
  }, [navigate]);

  function send() {
    if (!command.trim()) return;
    socketRef.current?.send(JSON.stringify({ command, assistant: "jarvis" }));
    setMessages((current) => [...current, { assistant: "user", content: command }]);
    setCommand("");
  }

  return (
    <Card className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">AI Assistant</h1>
        <p className="text-sm text-slate-500">Ask for exports, reports, insights, or navigation help.</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6">
        {messages.map((message, index) => (
          <div key={index} className={`max-w-2xl rounded-2xl px-4 py-3 text-sm ${message.assistant === "user" ? "ml-auto bg-blue-600 text-white" : "bg-white text-slate-700 shadow-sm"}`}>
            {message.content || message.message || JSON.stringify(message)}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 p-4">
        <div className="flex gap-3">
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Try: Export business trends" className="flex-1 rounded-lg border border-slate-200 px-4 py-3" />
          <button type="button" onClick={send} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
            Send
          </button>
        </div>
      </div>
    </Card>
  );
}
