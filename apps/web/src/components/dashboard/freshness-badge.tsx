'use client';
import { formatBlockAge, formatBlockNumber } from '@/lib/format.js';
import { Badge } from '@/components/ui/badge.js';

type Props = {
  asOfBlock: number;
  asOfTimestamp: number;
  source: string;
  stale?: boolean;
};

export function FreshnessBadge({ asOfBlock, asOfTimestamp, source, stale }: Props) {
  const age = formatBlockAge(asOfTimestamp);
  const blockStr = formatBlockNumber(asOfBlock);
  const isStale = stale || (Date.now() / 1000 - asOfTimestamp) > 15 * 60;

  return (
    <span
      title={`Data from block ${blockStr} via ${source}`}
      className="text-xs text-[rgb(var(--muted))] flex items-center gap-1"
    >
      {isStale ? (
        <Badge variant="orange">stale</Badge>
      ) : (
        <span className="size-1.5 rounded-full bg-green-500 inline-block" aria-hidden />
      )}
      block {blockStr} · {age}
    </span>
  );
}
