import { AGENTS } from "@/lib/content";

export default function AgentDiagram() {
  return (
    <div data-testid="agent-diagram">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {AGENTS.map((a, i) => (
          <div
            key={a.name}
            className="card flex flex-col h-full"
            data-testid={`card-agent-${i}`}
            style={{ background: i % 2 === 0 ? "var(--paper)" : "var(--paper-2)" }}
          >
            <p className="mono-cap text-ink-mute">{String(i + 1).padStart(2, "0")}</p>
            <h3 className="h3 mt-3 text-ink">{a.name}</h3>
            <p className="body-m mt-4 text-ink-2">{a.role}</p>
            <p className="body-s mt-4 text-pulse" style={{ fontWeight: 600 }}>{a.never}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
