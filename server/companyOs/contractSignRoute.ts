import type { Request, Response } from "express";
import {
  getContractByToken,
  signContract,
  type ContractParty,
} from "./legalAgent";
import type { LegalDocument } from "@shared/schema";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

function partyLabel(doc: LegalDocument, party: ContractParty): string {
  return party === "partyA"
    ? (doc.partyA ?? "Party A")
    : (doc.partyB ?? "Party B");
}

function counterpartyLabel(doc: LegalDocument, party: ContractParty): string {
  return party === "partyA"
    ? (doc.partyB ?? "Party B")
    : (doc.partyA ?? "Party A");
}

function alreadySigned(doc: LegalDocument, party: ContractParty): boolean {
  return party === "partyA" ? !!doc.partyASignedAt : !!doc.partyBSignedAt;
}

function signedName(doc: LegalDocument, party: ContractParty): string | null {
  return party === "partyA"
    ? doc.partyASignedName ?? null
    : doc.partyBSignedName ?? null;
}

function isLifecycleSignable(doc: LegalDocument): boolean {
  // Same allow-list as `signContract` itself — keep these in sync.
  return (
    doc.status === "sent" ||
    doc.status === "signed" ||
    doc.status === "generated"
  );
}

function renderShell(opts: {
  title: string;
  body: string;
  status?: number;
}): { html: string; status: number } {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>${escapeHtml(opts.title)}</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
        background: #f6f7f9;
        color: #1f2937;
        margin: 0;
        padding: 24px;
        display: flex;
        justify-content: center;
      }
      main {
        background: #fff;
        max-width: 560px;
        width: 100%;
        border-radius: 12px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
        padding: 28px;
      }
      h1 { font-size: 22px; margin: 0 0 4px; }
      h2 { font-size: 14px; color: #6b7280; margin: 0 0 24px; font-weight: 500; }
      .row { display: flex; justify-content: space-between; padding: 8px 0;
             border-bottom: 1px solid #f3f4f6; font-size: 14px; }
      .row:last-of-type { border-bottom: none; margin-bottom: 16px; }
      .row .k { color: #6b7280; }
      .row .v { color: #111827; font-weight: 500; text-align: right;
                max-width: 60%; word-break: break-word; }
      label { display: block; font-size: 13px; color: #374151;
              margin: 16px 0 6px; font-weight: 500; }
      input[type="text"], input[type="checkbox"] {
        font: inherit;
      }
      input[type="text"] {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 15px;
      }
      .checkbox-row { display: flex; gap: 8px; align-items: flex-start;
                      margin-top: 16px; font-size: 13px; color: #374151; }
      button {
        margin-top: 20px;
        width: 100%;
        padding: 12px 16px;
        background: #111827;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover { background: #1f2937; }
      .notice { background: #fef3c7; color: #78350f; padding: 12px;
                border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
      .ok { background: #d1fae5; color: #065f46; padding: 12px;
            border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
      .err { background: #fee2e2; color: #7f1d1d; padding: 12px;
             border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
      .meta { font-size: 12px; color: #9ca3af; margin-top: 16px;
              text-align: center; }
    </style>
  </head>
  <body>
    <main>${opts.body}</main>
  </body>
</html>`;
  return { html, status: opts.status ?? 200 };
}

function renderNotFound(): { html: string; status: number } {
  return renderShell({
    title: "Contract not found",
    status: 404,
    body: `
      <h1>Contract not found</h1>
      <h2>This signing link is invalid or has been revoked.</h2>
      <p style="font-size:14px;color:#6b7280">
        Please check the link you received or contact the party who sent it.
      </p>
    `,
  });
}

function renderSummary(
  doc: LegalDocument,
  party: ContractParty,
  message?: { kind: "ok" | "err" | "notice"; text: string },
): { html: string; status: number } {
  const value = Number(doc.valueAed ?? 0).toFixed(2);
  const me = partyLabel(doc, party);
  const them = counterpartyLabel(doc, party);
  const meta = (doc.metadata ?? {}) as { exchange?: string; date?: string };
  const exchange = meta.exchange ?? "—";
  const isSigned = alreadySigned(doc, party);
  const signable = isLifecycleSignable(doc);
  const meName = signedName(doc, party);

  const banner = message
    ? `<div class="${message.kind === "err" ? "err" : message.kind === "ok" ? "ok" : "notice"}">${escapeHtml(message.text)}</div>`
    : "";

  const counterpartySignedAt =
    party === "partyA" ? doc.partyBSignedAt : doc.partyASignedAt;
  const themName =
    party === "partyA" ? doc.partyBSignedName : doc.partyASignedName;

  const form = isSigned
    ? `<div class="ok">You signed this contract on
        ${escapeHtml(new Date((party === "partyA" ? doc.partyASignedAt : doc.partyBSignedAt) ?? new Date()).toLocaleString("en-AE"))}
        as <strong>${escapeHtml(meName ?? me)}</strong>.</div>
       ${
         doc.status === "active"
           ? `<div class="ok">Both parties have signed — the contract is now active.</div>`
           : `<div class="notice">Waiting for ${escapeHtml(them)} to sign.</div>`
       }`
    : !signable
      ? `<div class="err">This contract can no longer be signed (status: ${escapeHtml(doc.status)}).</div>`
      : `<form method="POST" action="">
           <label for="signerName">Your full name</label>
           <input type="text" id="signerName" name="signerName" required
                  maxlength="200" autocomplete="name"
                  placeholder="${escapeHtml(me)}" />
           <div class="checkbox-row">
             <input type="checkbox" id="agree" name="agree" required />
             <label for="agree" style="margin:0">
               I, on behalf of <strong>${escapeHtml(me)}</strong>, agree to
               the terms above and accept that typing my name and clicking
               "Sign contract" constitutes my electronic signature.
             </label>
           </div>
           <button type="submit">Sign contract</button>
         </form>`;

  const counterpartyLine = counterpartySignedAt
    ? `<div class="row"><span class="k">${escapeHtml(them)} signed</span><span class="v">${escapeHtml(themName ?? them)} · ${escapeHtml(new Date(counterpartySignedAt).toLocaleString("en-AE"))}</span></div>`
    : `<div class="row"><span class="k">${escapeHtml(them)}</span><span class="v">Pending</span></div>`;

  const body = `
    <h1>Sign contract</h1>
    <h2>${escapeHtml(me)} ⇄ ${escapeHtml(them)}</h2>
    ${banner}
    <div class="row"><span class="k">Exchange</span><span class="v">${escapeHtml(exchange)}</span></div>
    <div class="row"><span class="k">Value</span><span class="v">AED ${escapeHtml(value)}</span></div>
    <div class="row"><span class="k">Status</span><span class="v">${escapeHtml(doc.status)}</span></div>
    ${counterpartyLine}
    ${form}
    <div class="meta">
      AI-generated. Both parties should consult a UAE-qualified lawyer
      before signing.
    </div>`;
  return renderShell({ title: `Sign — ${me} ⇄ ${them}`, body });
}

function send(res: Response, out: { html: string; status: number }): void {
  res
    .status(out.status)
    .type("html")
    .set("Cache-Control", "no-store")
    .send(out.html);
}

function clientIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined) ?? "";
  const first = fwd.split(",")[0]?.trim();
  return (first || req.ip || "").slice(0, 64);
}

export async function handleContractSignPage(
  req: Request,
  res: Response,
): Promise<void> {
  const token = String(req.params.token ?? "");
  if (!TOKEN_RE.test(token)) return send(res, renderNotFound());
  try {
    const lookup = await getContractByToken(token);
    if (!lookup) return send(res, renderNotFound());
    return send(res, renderSummary(lookup.document, lookup.party));
  } catch (err) {
    console.error("[companyOs.legal] sign page render failed:", err);
    return send(
      res,
      renderShell({
        title: "Error",
        status: 500,
        body: `<h1>Something went wrong</h1>
               <p style="font-size:14px;color:#6b7280">
                 Please try again in a moment.
               </p>`,
      }),
    );
  }
}

export async function handleContractSignSubmit(
  req: Request,
  res: Response,
): Promise<void> {
  const token = String(req.params.token ?? "");
  if (!TOKEN_RE.test(token)) return send(res, renderNotFound());
  const signerName = String(req.body?.signerName ?? "").trim();
  const agreed = req.body?.agree === "on" || req.body?.agree === true;

  try {
    const lookup = await getContractByToken(token);
    if (!lookup) return send(res, renderNotFound());

    if (!agreed) {
      const out = renderSummary(lookup.document, lookup.party, {
        kind: "err",
        text: "You must tick the consent box to sign.",
      });
      return send(res, { ...out, status: 400 });
    }
    if (!signerName) {
      const out = renderSummary(lookup.document, lookup.party, {
        kind: "err",
        text: "Please enter your full name.",
      });
      return send(res, { ...out, status: 400 });
    }

    const result = await signContract({
      token,
      signerName,
      signerIp: clientIp(req),
    });

    if (!result.ok) {
      const fallbackDoc = result.document ?? lookup.document;
      const party = result.party ?? lookup.party;
      const text =
        result.error === "already_signed"
          ? "This party has already signed."
          : result.error === "wrong_status"
            ? `Contract can no longer be signed (status: ${fallbackDoc.status}).`
            : result.error === "missing_name"
              ? "Please enter your full name."
              : "Contract not found.";
      const status = result.error === "not_found" ? 404 : 400;
      const out = renderSummary(fallbackDoc, party, { kind: "err", text });
      return send(res, { ...out, status });
    }

    const okText = result.bothSigned
      ? "Signed. Both parties have accepted — the contract is now active."
      : "Signed. Waiting for the other party to accept.";
    return send(
      res,
      renderSummary(result.document, result.party, {
        kind: "ok",
        text: okText,
      }),
    );
  } catch (err) {
    console.error("[companyOs.legal] sign submit failed:", err);
    return send(
      res,
      renderShell({
        title: "Error",
        status: 500,
        body: `<h1>Something went wrong</h1>
               <p style="font-size:14px;color:#6b7280">
                 Please try again in a moment.
               </p>`,
      }),
    );
  }
}
