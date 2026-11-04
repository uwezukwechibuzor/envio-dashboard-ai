# Using envio-data-mcp

`envio-data-mcp` is an MCP (Model Context Protocol) server that exposes Envio's HyperSync on-chain data tools to Claude Code, Cursor, Claude Desktop, and any MCP-capable AI agent.

---

## Prerequisites

- Node.js 22+ (or `npx` will handle it)
- An Envio API token — free at [envio.dev/app/api-tokens](https://envio.dev/app/api-tokens)
- For Claude Code: Claude Code CLI installed

---

## Install in Claude Code

```bash
claude mcp add envio-data -- npx envio-data-mcp
```

Then verify:

```
/mcp
```

You should see `envio-data` listed with 8 tools.

**Manual config** (`~/.claude/mcp_settings.json`):

```json
{
  "mcpServers": {
    "envio-data": {
      "command": "npx",
      "args": ["envio-data-mcp"],
      "env": {
        "ENVIO_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## Install in Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "envio-data": {
      "command": "npx",
      "args": ["envio-data-mcp"],
      "env": {
        "ENVIO_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## Install in Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "envio-data": {
      "command": "npx",
      "args": ["envio-data-mcp"],
      "env": {
        "ENVIO_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## HTTP mode (for remote agents)

```bash
MCP_PORT=3001 npx envio-data-mcp --http
```

Secure with bearer tokens:

```bash
MCP_API_KEYS=key1,key2 MCP_PORT=3001 npx envio-data-mcp --http
```

Then set the MCP URL in your agent's config:

```
http://your-host:3001/mcp
```

---

## Available tools

### `resolve_protocol`
Resolves a natural-language protocol name or contract address to a known pack ID.

```
resolve_protocol({ query: "uniswap v3" })
→ { id: "uniswap-v3", name: "Uniswap V3", chains: [1, 42161, 10, 8453, 137] }
```

Always call this first. Never invent protocol IDs.

### `list_metrics`
Lists available metrics for a resolved protocol pack.

```
list_metrics({ protocolId: "uniswap-v3" })
→ [{ id: "volume_usd", label: "Volume (USD)", unit: "usd", source: "hypersync" }, ...]
```

Only use metric IDs returned by this tool.

### `get_metric_series`
Fetches a daily time-series for a protocol metric.

```
get_metric_series({
  protocol: "uniswap-v3",
  metric: "volume_usd",
  chainId: 1,
  fromDate: "2026-01-01",
  toDate: "2026-01-31"
})
→ { points: [{ date: "2026-01-01", value: "12340000000" }, ...], unit: "usd", ... }
```

Values are in micro-USD (integer). Divide by 1,000,000 for display.

### `contract_activity`
Raw transaction and event counts for any contract address.

```
contract_activity({ address: "0x...", chainId: 1, fromDate: "...", toDate: "..." })
```

### `top_accounts`
Top addresses by activity volume or transaction count.

```
top_accounts({ protocol: "uniswap-v3", metric: "volume_usd", chainId: 1, limit: 10, fromDate: "...", toDate: "..." })
```

### `supported_chains`
Returns all supported chain IDs and names.

### `estimate_query_cost`
Estimates HyperSync query cost (token budget) before running.

### `get_block_range`
Converts a date range to block numbers for a given chain.

---

## Example agent prompts (Claude Code)

After installing the MCP server, try these in Claude Code:

```
Fetch Uniswap V3 volume on Arbitrum for the last 30 days and plot a chart.
```

```
Compare Uniswap V3 and SushiSwap fee revenue on Ethereum for Q4 2026.
```

```
What are the top 10 addresses by Aave V3 borrow volume on Ethereum last week?
```

---

## Security notes

- `ENVIO_API_TOKEN` is used server-side only — never exposed to agent output.
- On-chain string values (token names, event data) are automatically sanitized before being passed to the LLM — injection patterns are redacted.
- In HTTP mode, set `MCP_API_KEYS` to restrict access.
- Rate limits: `MCP_RATE_LIMIT_MAX` (default 60 req/min per IP).

---

## MCP registry listing

`envio-data-mcp` is listed in:
- [mcp.so/server/envio-data](https://mcp.so)
- [smithery.ai/server/envio-data-mcp](https://smithery.ai)

Install via Smithery:

```bash
npx @smithery/cli install envio-data-mcp --client claude
```
