'use client';

const EXAMPLES = [
  'Uniswap V3 fees & volume on Ethereum',
  'Aave liquidations on Arbitrum last 90 days',
  'Analyse a contract address',
  'Compare Uniswap V3 vs SushiSwap volume',
  'Aave deposits and borrows this month',
  'PancakeSwap on BSC last 7 days',
];

type Props = { onSelect: (prompt: string) => void };

export function ExampleChips({ onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {EXAMPLES.map((example) => (
        <button
          key={example}
          onClick={() => onSelect(example)}
          className="px-3 py-1.5 text-sm rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:border-[rgb(var(--accent))]/50 transition-all"
        >
          {example}
        </button>
      ))}
    </div>
  );
}
