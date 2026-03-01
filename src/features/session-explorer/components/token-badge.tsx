import { formatCost } from "@core/utils/format-cost";

export function TokenBadge({
  inputTokens,
  outputTokens,
  cacheCreationTokens,
  cacheReadTokens,
  cost,
}: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheCreationTokens?: number | null;
  cacheReadTokens?: number | null;
  cost?: number | null;
}) {
  if (!inputTokens && !outputTokens) return null;

  return (
    <div className="flex items-center gap-2 mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
      {inputTokens ? <span>in: {inputTokens.toLocaleString()}</span> : null}
      {outputTokens ? <span>out: {outputTokens.toLocaleString()}</span> : null}
      {cacheReadTokens ? <span>cache: {cacheReadTokens.toLocaleString()}</span> : null}
      {cost ? (
        <span className="font-medium text-amber-400">{formatCost(cost)}</span>
      ) : null}
    </div>
  );
}
