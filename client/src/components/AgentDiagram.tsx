import { AGENTS, CONDUCTOR } from "@/lib/content";

const GRADS = [
  "grad-01-dawn",
  "grad-02-tide",
  "grad-03-fieldwork",
  "grad-05-meadow",
];

export default function AgentDiagram({ withConductor = true }: { withConductor?: boolean }) {
  return (
    <div data-testid="agent-diagram">
      {withConductor && (
        <div className={`grad ${GRADS[3]} card mb-6`} data-testid="card-conductor">
          <p className="mono-cap text-ink-mute">00 — THE CONDUCTOR</p>
          <h3 className="h3 mt-3 text-ink">{CONDUCTOR.name}</h3>
          <p className="body-m mt-3 text-ink-2 italic">{CONDUCTOR.short}</p>
          <p className="body-m mt-4 text-ink-2">{CONDUCTOR.body}</p>
          <p className="body-s mt-5 text-ink" style={{ fontWeight: 600 }}>
            <span className="mono-cap text-ink-mute">NEVER · </span>{CONDUCTOR.never}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {AGENTS.map((a, i) => (
          <div
            key={a.name}
            className={`grad ${GRADS[i % GRADS.length]} card flex flex-col h-full`}
            data-testid={`card-agent-${i}`}
          >
            <p className="mono-cap text-ink-mute">{String(i + 1).padStart(2, "0")}</p>
            <h3 className="h3 mt-3 text-ink">{a.name}</h3>
            <p className="body-s mt-2 mono-cap text-ink-mute">{a.short}</p>
            <p className="body-m mt-4 text-ink-2 flex-grow">{a.body}</p>
            <p className="body-s mt-4 text-pulse" style={{ fontWeight: 600 }}>
              NEVER · {a.never}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
