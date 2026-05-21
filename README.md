# goodlinks-mcp

[![npm version](https://img.shields.io/npm/v/goodlinks-mcp)](https://www.npmjs.com/package/goodlinks-mcp)
[![npm downloads](https://img.shields.io/npm/dm/goodlinks-mcp)](https://www.npmjs.com/package/goodlinks-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects Claude to the [GoodLinks](https://goodlinks.app) read-later app on macOS. Ask Claude to search your reading list, summarise articles, manage tags, export highlights, and more — all from a Claude conversation.

## Prerequisites

- **GoodLinks 3.2+** on macOS with the local REST API enabled
- **Node.js 18+**

## Enable the GoodLinks API

1. Open GoodLinks
2. Go to **Settings → API**
3. Toggle the API on
4. Copy the bearer token shown — you'll need it for configuration

> The API listens on `http://localhost:9428` by default. You can change the port in the same settings screen.

## Installation

### Via npx (recommended — no install needed)

Add the following to your Claude Desktop configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "goodlinks": {
      "command": "npx",
      "args": ["-y", "goodlinks-mcp"],
      "env": {
        "GOODLINKS_TOKEN": "your-token-here"
      }
    }
  }
}
```

If you use a non-default port, add `"GOODLINKS_PORT": "9999"` to the `env` block.

Restart Claude Desktop and you should see the GoodLinks tools available.

### Global install

```bash
npm install -g goodlinks-mcp
```

Then use `goodlinks-mcp` instead of `npx goodlinks-mcp` in the config above.

### From source

```bash
git clone https://github.com/lcajigasm/goodlinks-mcp.git
cd goodlinks-mcp
npm install
npm run build
```

Then configure Claude Desktop:

```json
{
  "mcpServers": {
    "goodlinks": {
      "command": "node",
      "args": ["/absolute/path/to/goodlinks-mcp/dist/index.js"],
      "env": {
        "GOODLINKS_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOODLINKS_TOKEN` | Yes | — | Bearer token from GoodLinks → Settings → API |
| `GOODLINKS_PORT` | No | `9428` | Port the GoodLinks API listens on |

## Available tools

### Links

| Tool | Description |
|---|---|
| `search_links` | Search and filter your entire library. Supports full-text search, tag filters, read/starred/highlighted filters, word-count range, date range, and sort order. |
| `get_links_in_list` | Retrieve links from a built-in list: `unread`, `read`, `starred`, `untagged`, `highlighted`, or `all`. |
| `get_link_by_id` | Fetch a single link by its GoodLinks ID. |
| `get_link_by_url` | Look up a saved link by URL. |
| `get_current_link` | Get the link currently selected in the GoodLinks app. |
| `add_link` | Save a new URL (or update it if already saved). Accepts title, summary, tags, read/starred flags, and a custom saved date. |
| `edit_link` | Update a link's title, summary, starred/read status, or tags. Supports adding/removing individual tags or replacing the full tag set. |
| `delete_links` | Move one or more links to the trash (recoverable from within GoodLinks). |
| `get_article_content` | Retrieve the full article text in `html`, `plaintext`, or `markdown` format. |

### Lists

| Tool | Description |
|---|---|
| `get_lists` | Get all visible lists (built-in and custom). |

### Tags

| Tool | Description |
|---|---|
| `get_tags` | Get every tag in your library. |

### Highlights

| Tool | Description |
|---|---|
| `search_highlights` | Search highlights by text content, note, link ID, or date range. |
| `edit_highlight` | Update the note attached to a highlight. |
| `export_highlights` | Export all highlights from a link as formatted Markdown. |

## Example prompts

- "What are my unread starred articles about AI?"
- "Add this URL to my reading list and tag it 'research': https://…"
- "Show me all highlights I made this week"
- "Summarise the article I have open in GoodLinks"
- "Export the highlights from my last-read article as Markdown"
- "What tags do I use most?"

## Troubleshooting

**"GoodLinks API is not reachable"**
- Make sure GoodLinks is open and running
- Confirm the API is enabled in **Settings → API**
- Check that no firewall is blocking localhost connections
- If you changed the port, set `GOODLINKS_PORT` accordingly

**"Invalid or missing GoodLinks API token"**
- Re-copy the token from **Settings → API** (it may have been regenerated)
- Make sure the token is set in `GOODLINKS_TOKEN` with no extra whitespace

**Claude doesn't see the GoodLinks tools**
- Restart Claude Desktop after editing the config file
- Validate the JSON in `claude_desktop_config.json` (a trailing comma will break it)
- Run `npx goodlinks-mcp` manually in a terminal to check for Node errors

## License

MIT
