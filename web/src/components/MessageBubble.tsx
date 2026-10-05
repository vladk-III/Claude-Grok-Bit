import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent, ChatMessage } from "@crewbit/shared";

export function MessageBubble({
  message,
  agent,
  streaming,
}: {
  message: ChatMessage;
  agent?: Agent;
  streaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">{message.text}</div>
      </div>
    );
  }

  const color = agent?.color ?? "#64748b";
  return (
    <div className="msg agent">
      <div className="avatar" style={{ background: color }}>
        {agent?.emoji ?? "🤖"}
      </div>
      <div className="msg-body">
        <div className="msg-name" style={{ color }}>
          {message.agentName ?? agent?.name ?? "Agent"}
          {message.model && <span className="msg-model">{message.model}</span>}
        </div>
        {message.searches && message.searches.length > 0 && (
          <div className="searches">
            {message.searches.map((q, i) => (
              <span key={i} className="chip small">
                🔎 {q}
              </span>
            ))}
          </div>
        )}
        {message.thinking && (
          <details className="thinking">
            <summary>Thinking</summary>
            <div>{message.thinking}</div>
          </details>
        )}
        {message.text ? (
          <div className="markdown">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
            >
              {message.text}
            </Markdown>
          </div>
        ) : (
          streaming && !message.error && <div className="muted small">thinking…</div>
        )}
        {message.error && <div className="msg-error">⚠️ {message.error}</div>}
        {message.text && !streaming && (
          <button className="link-btn" onClick={() => void navigator.clipboard?.writeText(message.text)}>
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
