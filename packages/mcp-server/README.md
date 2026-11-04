# envio-data-mcp

MCP server that exposes Envio's HyperSync and HyperIndex on-chain data to Claude Code, Cursor, Claude Desktop, and any MCP-capable AI agent.

## Quick start

```bash
npx envio-data-mcp
```

That's it. Claude Code automatically picks up all tools. Set `ENVIO_API_TOKEN` first (get one free at [envio.dev/app/api-tokens](https://envio.dev/app/api-tokens)).

## Install in Claude Code

```bash
claude mcp add envio-data -- npx envio-data-mcp
```

Or add to `~/.claude/mcp_settings.json`:

```json
{
  "mcpServers": {
    "envio-data": {
      "command": "npx",
      "args": ["envio-data-mcp"],
      "env": { "ENVIO_API_TOKEN": "your_token_here" }
    }
  }
}
```

## HTTP mode (for Cursor, remote agents)

```bash
MCP_PORT=3001 npx envio-data-mcp --http
```

## Available tools

| Tool | Description |
|---|---|
| `resolve_protocol` | Resolve a protocol name or contract address to a known pack ID |
| `list_metrics` | List available metrics for a resolved protocol |
| `get_metric_series` | Fetch a daily time-series metric (volume, fees, TVL, tx count, etc.) |
| `contract_activity` | Raw transaction / event counts for any contract |
| `top_accounts` | Top addresses by activity or volume |
| `supported_chains` | List supported chain IDs and names |
| `estimate_query_cost` | Estimate HyperSync query cost before running |
| `get_block_range` | Resolve date range to block numbers for a chain |

## Env vars

| Variable | Required | Description |
|---|---|---|
| `ENVIO_API_TOKEN` | Yes | HyperSync API token |
| `MCP_PORT` | No (default 3001) | HTTP server port |
| `MCP_API_KEYS` | No | Comma-separated bearer tokens for HTTP auth |

## License

Apache-2.0
