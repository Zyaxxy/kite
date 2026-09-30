import styles from "./Portfolio.module.css";

type Allocation = { label: string; value: number };
/** Distribution of observed values only; never a simulated history chart. */
export function PortfolioAllocation({
  entries,
  partial = false,
}: {
  entries: Allocation[];
  partial?: boolean;
}) {
  const grouped = new Map<string, number>();
  for (const entry of entries)
    if (Number.isFinite(entry.value) && entry.value > 0)
      grouped.set(entry.label, (grouped.get(entry.label) ?? 0) + entry.value);
  const valued = Array.from(grouped, ([label, value]) => ({
    label,
    value,
  })).sort((a, b) => b.value - a.value);
  const total = valued.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0)) return null;
  const segments =
    valued.length > 5
      ? [
          ...valued.slice(0, 4),
          {
            label: "Other assets",
            value: valued.slice(4).reduce((sum, item) => sum + item.value, 0),
          },
        ]
      : valued;
  return (
    <section className={styles.allocation} aria-labelledby="allocation-heading">
      <div>
        <h2 id="allocation-heading">Where your value sits.</h2>
        <p>
          {partial
            ? "Distribution of priced holdings only. Unpriced assets are excluded."
            : "Current allocation by observed value. It is a snapshot, not a return forecast."}
        </p>
      </div>
      <div>
        <div className={styles.track} aria-hidden="true">
          {segments.map((item, i) => (
            <span
              key={item.label}
              style={{ flex: item.value, opacity: 1 - i * 0.15 }}
            />
          ))}
        </div>
        <div className={styles.legend}>
          {segments.map((item, i) => (
            <span key={item.label}>
              <i style={{ opacity: 1 - i * 0.15 }} aria-hidden="true" />
              {item.label}
              <strong>{((item.value / total) * 100).toFixed(1)}%</strong>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
