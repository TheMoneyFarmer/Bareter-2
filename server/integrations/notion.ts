import { getIntegrationCredential, isIntegrationConfigured } from "./credentials";

export interface NotionPage {
  id: string;
  title: string;
  content: string;
  lastEdited: string;
}

export async function isNotionConfigured(): Promise<boolean> {
  return isIntegrationConfigured(["notion_token", "notion_database_id"]);
}

async function notionFetch(
  token: string,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Notion API ${method} ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

function extractPlainText(richTextArr: unknown[]): string {
  if (!Array.isArray(richTextArr)) return "";
  return richTextArr
    .map((rt: unknown) => {
      const r = rt as { plain_text?: string };
      return r.plain_text ?? "";
    })
    .join("");
}

function extractPageTitle(page: unknown): string {
  const p = page as { properties?: Record<string, unknown> };
  if (!p.properties) return "Untitled";
  for (const [, val] of Object.entries(p.properties)) {
    const v = val as { type?: string; title?: unknown[] };
    if (v.type === "title" && Array.isArray(v.title)) {
      return extractPlainText(v.title) || "Untitled";
    }
  }
  return "Untitled";
}

async function fetchBlockContent(token: string, blockId: string): Promise<string> {
  try {
    const data = await notionFetch(token, `/blocks/${blockId}/children?page_size=20`) as {
      results?: Array<{ type?: string; [key: string]: unknown }>;
    };
    const lines: string[] = [];
    for (const block of data.results ?? []) {
      const type = block.type;
      if (!type) continue;
      const inner = block[type] as { rich_text?: unknown[] } | undefined;
      if (inner?.rich_text) {
        const text = extractPlainText(inner.rich_text);
        if (text) lines.push(text);
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export async function fetchNotionKBArticles(limit = 10): Promise<NotionPage[]> {
  const token = await getIntegrationCredential("notion_token");
  const databaseId = await getIntegrationCredential("notion_database_id");
  if (!token || !databaseId) return [];

  try {
    const data = await notionFetch(token, `/databases/${databaseId}/query`, "POST", {
      page_size: limit,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    }) as { results?: unknown[] };

    const pages: NotionPage[] = [];
    for (const page of data.results ?? []) {
      const p = page as { id?: string; last_edited_time?: string };
      const id = p.id ?? "";
      const title = extractPageTitle(page);
      const content = await fetchBlockContent(token, id);
      pages.push({
        id,
        title,
        content: content.slice(0, 2000),
        lastEdited: p.last_edited_time ?? "",
      });
    }
    return pages;
  } catch (err) {
    console.error("[Notion] fetchNotionKBArticles error:", err);
    return [];
  }
}

export async function pushSummaryToNotion(
  databaseId: string,
  title: string,
  content: string,
): Promise<boolean> {
  const token = await getIntegrationCredential("notion_token");
  if (!token) return false;
  try {
    await notionFetch(token, "/pages", "POST", {
      parent: { database_id: databaseId },
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: content.slice(0, 2000) } }] },
        },
      ],
    });
    return true;
  } catch (err) {
    console.error("[Notion] pushSummaryToNotion error:", err);
    return false;
  }
}
