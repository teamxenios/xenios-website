import { ALL_ECOSYSTEM_NAMES } from "@/lib/content";

interface Props {
  rows?: 1 | 2;
  items?: string[];
}

export default function EcosystemMarquee({ rows = 2, items }: Props) {
  const list = items ?? ALL_ECOSYSTEM_NAMES;
  const half = Math.ceil(list.length / 2);
  const rowA = rows === 2 ? list.slice(0, half) : list;
  const rowB = rows === 2 ? list.slice(half) : [];

  function renderRow(arr: string[], reverse = false, rowIndex = 0) {
    return (
      <div className="marquee-row fade py-3" data-testid={`marquee-row-${rowIndex}`}>
        <div className={`marquee ${reverse ? "reverse" : ""}`}>
          {[...arr, ...arr].map((n, idx) => (
            <span key={`${rowIndex}-${idx}-${n}`} className="marquee-item">{n}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="ecosystem-marquee" className="select-none">
      {renderRow(rowA, false, 0)}
      {rows === 2 && renderRow(rowB, true, 1)}
    </div>
  );
}
