#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GOODLINKS_TOKEN = process.env.GOODLINKS_TOKEN;
const GOODLINKS_PORT = process.env.GOODLINKS_PORT ?? "9428";
const BASE_URL = `http://localhost:${GOODLINKS_PORT}/api/v1`;

if (!GOODLINKS_TOKEN) {
  console.error(
    "GOODLINKS_TOKEN environment variable is required.\n" +
      "Enable the API in GoodLinks → Settings → API and paste the token."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

class GoodLinksError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "GoodLinksError";
  }
}

async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${GOODLINKS_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed") ||
      msg.includes("ECONNRESET")
    ) {
      throw new GoodLinksError(
        "GoodLinks API is not reachable. Make sure GoodLinks is running and the API is enabled in Settings → API."
      );
    }
    throw new GoodLinksError(`Network error: ${msg}`);
  }

  if (response.status === 401) {
    throw new GoodLinksError(
      "Invalid or missing GoodLinks API token. Check GOODLINKS_TOKEN environment variable."
    );
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return null;
  }

  const text = await response.text();
  if (!text) return null;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    const errMsg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as Record<string, unknown>).message === "string"
        ? (body as Record<string, unknown>).message as string
        : `HTTP ${response.status}: ${response.statusText}`;
    throw new GoodLinksError(errMsg, response.status);
  }

  return body;
}

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        qs.append(key, String(item));
      }
    } else {
      qs.set(key, String(value));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

function toolResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown): { content: Array<{ type: "text"; text: string }> } {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }] };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "goodlinks-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Links tools
// ---------------------------------------------------------------------------

server.tool(
  "search_links",
  "Search and filter links saved in GoodLinks. All parameters are optional.",
  {
    search: z.string().optional().describe("Full-text search query"),
    tag: z.array(z.string()).optional().describe("Filter by one or more tags"),
    starred: z.boolean().optional().describe("Filter by starred status"),
    read: z.boolean().optional().describe("Filter by read status"),
    tagged: z.boolean().optional().describe("Filter to links that have (or have no) tags"),
    highlighted: z.boolean().optional().describe("Filter to links that have highlights"),
    wordCountMin: z.number().int().optional().describe("Minimum word count"),
    wordCountMax: z.number().int().optional().describe("Maximum word count"),
    addedAfter: z.string().optional().describe("ISO 8601 date — only links added after this date"),
    addedBefore: z.string().optional().describe("ISO 8601 date — only links added before this date"),
    sort: z
      .enum([
        "newestSaved",
        "oldestSaved",
        "newestRead",
        "oldestRead",
        "shortest",
        "longest",
        "titleA",
        "titleZ",
      ])
      .optional()
      .describe("Sort order"),
    limit: z.number().int().min(1).default(20).describe("Max number of results (default 20)"),
    offset: z.number().int().min(0).optional().describe("Pagination offset"),
  },
  async (params) => {
    try {
      const data = await apiFetch(`/links${buildQuery(params)}`);
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_links_in_list",
  "Get links from one of the built-in GoodLinks lists (Unread, Read, Starred, etc.).",
  {
    list: z
      .enum(["unread", "read", "starred", "untagged", "highlighted", "all"])
      .describe("Which built-in list to retrieve"),
    search: z.string().optional().describe("Full-text search within the list"),
    tag: z.array(z.string()).optional().describe("Filter by tags"),
    includeRead: z.boolean().optional().describe("Include read links (relevant for unread list)"),
    limit: z.number().int().min(1).optional().describe("Max number of results"),
    offset: z.number().int().min(0).optional().describe("Pagination offset"),
  },
  async ({ list, ...rest }) => {
    try {
      const data = await apiFetch(`/links${buildQuery({ list, ...rest })}`);
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_link_by_id",
  "Get a single link by its GoodLinks ID.",
  {
    id: z.string().describe("The link ID"),
  },
  async ({ id }) => {
    try {
      const data = await apiFetch(`/links/${encodeURIComponent(id)}`);
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_link_by_url",
  "Look up a saved link by its URL.",
  {
    url: z.string().url().describe("The URL to look up"),
  },
  async ({ url }) => {
    try {
      const data = await apiFetch(`/links${buildQuery({ url })}`);
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_current_link",
  "Get the link that is currently selected/open in the GoodLinks app.",
  {},
  async () => {
    try {
      const data = await apiFetch("/links/current");
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "add_link",
  "Add a new link to GoodLinks. If the URL already exists it will be updated instead.",
  {
    url: z.string().url().describe("The URL to save (required)"),
    title: z.string().optional().describe("Override the page title"),
    summary: z.string().optional().describe("A short summary or description"),
    tags: z.array(z.string()).optional().describe("Tags to apply"),
    read: z.boolean().optional().describe("Mark as read"),
    starred: z.boolean().optional().describe("Mark as starred"),
    addedAt: z.string().optional().describe("ISO 8601 date to use as the saved date"),
  },
  async (params) => {
    try {
      const data = await apiFetch("/links", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "edit_link",
  "Update an existing link's metadata.",
  {
    id: z.string().describe("The link ID to update (required)"),
    title: z.string().optional().describe("New title"),
    summary: z.string().optional().describe("New summary"),
    starred: z.boolean().optional().describe("Set starred status"),
    read: z.boolean().optional().describe("Set read status"),
    addedTags: z.array(z.string()).optional().describe("Tags to add"),
    removedTags: z.array(z.string()).optional().describe("Tags to remove"),
    tags: z.array(z.string()).optional().describe("Replace all tags with this set"),
  },
  async ({ id, ...rest }) => {
    try {
      const data = await apiFetch(`/links/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(rest),
      });
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "delete_links",
  "Move one or more links to the trash. This is reversible from within GoodLinks.",
  {
    ids: z.array(z.string()).min(1).describe("Array of link IDs to delete (required)"),
  },
  async ({ ids }) => {
    try {
      const data = await apiFetch("/links", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      return toolResult(data ?? { deleted: ids.length });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_article_content",
  "Get the full article content for a saved link.",
  {
    id: z.string().describe("The link ID"),
    format: z
      .enum(["html", "plaintext", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
    autoDownload: z
      .boolean()
      .default(true)
      .describe("Automatically download the article if not cached (default: true)"),
  },
  async ({ id, format, autoDownload }) => {
    try {
      const data = await apiFetch(
        `/links/${encodeURIComponent(id)}/content${buildQuery({ format, autoDownload })}`
      );
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Lists tools
// ---------------------------------------------------------------------------

server.tool(
  "get_lists",
  "Get all visible lists in GoodLinks (both built-in and custom).",
  {},
  async () => {
    try {
      const data = await apiFetch("/lists");
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tags tools
// ---------------------------------------------------------------------------

server.tool(
  "get_tags",
  "Get all tags used in GoodLinks.",
  {},
  async () => {
    try {
      const data = await apiFetch("/tags");
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Highlights tools
// ---------------------------------------------------------------------------

server.tool(
  "search_highlights",
  "Search and filter highlights across all saved links.",
  {
    q: z.string().optional().describe("General search query across all highlight fields"),
    linkID: z.string().optional().describe("Filter highlights by link ID"),
    content: z.string().optional().describe("Search within highlight text content"),
    note: z.string().optional().describe("Search within highlight notes"),
    createdAfter: z.string().optional().describe("ISO 8601 date — highlights created after"),
    createdBefore: z.string().optional().describe("ISO 8601 date — highlights created before"),
    sort: z
      .enum(["newest", "oldest", "linkID", "content", "note"])
      .optional()
      .describe("Sort order"),
    limit: z.number().int().min(1).optional().describe("Max number of results"),
    offset: z.number().int().min(0).optional().describe("Pagination offset"),
  },
  async (params) => {
    try {
      const data = await apiFetch(`/highlights${buildQuery(params)}`);
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "edit_highlight",
  "Update the note attached to a highlight.",
  {
    id: z.string().describe("The highlight ID (required)"),
    note: z.string().describe("The new note text"),
  },
  async ({ id, note }) => {
    try {
      const data = await apiFetch(`/highlights/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      });
      return toolResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "export_highlights",
  "Export all highlights from a link as formatted Markdown.",
  {
    id: z.string().describe("The link ID whose highlights to export"),
  },
  async ({ id }) => {
    try {
      const response = await fetch(
        `${BASE_URL}/links/${encodeURIComponent(id)}/highlights/export`,
        {
          headers: {
            Authorization: `Bearer ${GOODLINKS_TOKEN}`,
            Accept: "text/markdown, text/plain, */*",
          },
        }
      );

      if (response.status === 401) {
        return errorResult(
          new GoodLinksError(
            "Invalid or missing GoodLinks API token. Check GOODLINKS_TOKEN environment variable."
          )
        );
      }

      if (!response.ok) {
        return errorResult(new GoodLinksError(`HTTP ${response.status}: ${response.statusText}`));
      }

      const text = await response.text();
      return toolResult(text || "(no highlights found)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        return errorResult(
          new GoodLinksError(
            "GoodLinks API is not reachable. Make sure GoodLinks is running and the API is enabled in Settings → API."
          )
        );
      }
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GoodLinks MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
