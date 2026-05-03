import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LegalDocLayout } from "@/components/legal-doc-page";
import type { LegalBlock, LegalDoc } from "@/content/legal";

type AdminLegalRow = {
  slug: string;
  language: "en" | "ar";
  title: string;
  subtitle: string;
  effectiveDate: string;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

type AdminLegalDoc = AdminLegalRow & { blocks: LegalBlock[] };

type LegalVersion = {
  id: string;
  version: number;
  publishedAt: string;
  publishedBy: string | null;
  effectiveDate: string;
};

export function AdminLegalSection() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ slug: string; language: "en" | "ar" } | null>(null);

  const { data: rows, isLoading } = useQuery<AdminLegalRow[]>({
    queryKey: ["/api/admin/legal"],
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { en?: AdminLegalRow; ar?: AdminLegalRow }>();
    for (const r of rows ?? []) {
      const cur = map.get(r.slug) ?? {};
      cur[r.language] = r;
      map.set(r.slug, cur);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <div className="space-y-6" data-testid="admin-legal-section">
      <div>
        <h1 className="text-3xl font-bold">Legal pack</h1>
        <p className="text-muted-foreground mt-1">
          Edit, preview, and publish public legal documents. Each publish is
          versioned for audit. Changes go live immediately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Title (EN)</TableHead>
                  <TableHead>EN version</TableHead>
                  <TableHead>AR version</TableHead>
                  <TableHead>Effective date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(([slug, langs]) => (
                  <TableRow key={slug} data-testid={`row-legal-${slug}`}>
                    <TableCell className="font-mono text-xs">{slug}</TableCell>
                    <TableCell>{langs.en?.title ?? langs.ar?.title ?? "—"}</TableCell>
                    <TableCell>
                      {langs.en ? (
                        <Badge variant="outline">v{langs.en.version}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {langs.ar ? (
                        <Badge variant="outline">v{langs.ar.version}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {langs.en?.effectiveDate ?? langs.ar?.effectiveDate ?? "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {langs.en && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing({ slug, language: "en" })}
                          data-testid={`button-edit-legal-${slug}-en`}
                        >
                          Edit EN
                        </Button>
                      )}
                      {langs.ar && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing({ slug, language: "ar" })}
                          data-testid={`button-edit-legal-${slug}-ar`}
                        >
                          Edit AR
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && (
        <LegalEditorDialog
          slug={editing.slug}
          language={editing.language}
          onClose={() => setEditing(null)}
          onPublished={() => {
            toast({ title: "Published", description: `Legal page ${editing.slug} (${editing.language}) updated.` });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function LegalEditorDialog({
  slug,
  language,
  onClose,
  onPublished,
}: {
  slug: string;
  language: "en" | "ar";
  onClose: () => void;
  onPublished: () => void;
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [blocksJson, setBlocksJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const { data: doc, isLoading } = useQuery<AdminLegalDoc>({
    queryKey: ["/api/admin/legal", slug, language],
    queryFn: async () => {
      const res = await fetch(`/api/admin/legal/${encodeURIComponent(slug)}/${language}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load doc");
      return res.json();
    },
  });

  const { data: versions } = useQuery<LegalVersion[]>({
    queryKey: ["/api/admin/legal", slug, language, "versions"],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/legal/${encodeURIComponent(slug)}/${language}/versions`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load versions");
      return res.json();
    },
  });

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title);
    setSubtitle(doc.subtitle ?? "");
    setEffectiveDate(doc.effectiveDate);
    setBlocksJson(JSON.stringify(doc.blocks, null, 2));
  }, [doc]);

  const parsedBlocks: LegalBlock[] | null = useMemo(() => {
    try {
      const parsed = JSON.parse(blocksJson);
      if (!Array.isArray(parsed)) throw new Error("blocks must be an array");
      setJsonError(null);
      return parsed as LegalBlock[];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON";
      setJsonError(message);
      return null;
    }
  }, [blocksJson]);

  const previewDoc: LegalDoc | null =
    parsedBlocks && title
      ? { slug, title, subtitle, blocks: parsedBlocks }
      : null;

  const publish = useMutation({
    mutationFn: async () => {
      if (!parsedBlocks) throw new Error(jsonError ?? "Invalid blocks JSON");
      await apiRequest("PUT", `/api/admin/legal/${encodeURIComponent(slug)}/${language}`, {
        title,
        subtitle,
        effectiveDate,
        blocks: parsedBlocks,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/legal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/legal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/legal", slug, language] });
      onPublished();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="dialog-legal-editor">
        <DialogHeader>
          <DialogTitle>
            Edit {slug} <Badge variant="outline" className="ms-2">{language.toUpperCase()}</Badge>
          </DialogTitle>
          <DialogDescription>
            Publishing snapshots the previous version into the audit log and
            takes effect immediately on the public page.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <Tabs defaultValue="edit" className="w-full">
            <TabsList>
              <TabsTrigger value="edit" data-testid="tab-legal-edit">Edit</TabsTrigger>
              <TabsTrigger value="preview" data-testid="tab-legal-preview">Preview</TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-legal-history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">Title</span>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="input-legal-title"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Effective date</span>
                  <Input
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    placeholder="3 May 2026"
                    data-testid="input-legal-effective-date"
                  />
                </label>
              </div>
              <label className="space-y-1 block">
                <span className="text-sm font-medium">Subtitle</span>
                <Input
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  data-testid="input-legal-subtitle"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-sm font-medium">
                  Body (JSON array of blocks: <code>h2</code> / <code>h3</code> / <code>p</code> / <code>ul</code>)
                </span>
                <Textarea
                  value={blocksJson}
                  onChange={(e) => setBlocksJson(e.target.value)}
                  rows={20}
                  className="font-mono text-xs"
                  data-testid="textarea-legal-blocks"
                />
                {jsonError && (
                  <p className="text-xs text-destructive" data-testid="text-legal-json-error">
                    {jsonError}
                  </p>
                )}
              </label>
            </TabsContent>

            <TabsContent value="preview" className="pt-4" dir={language === "ar" ? "rtl" : "ltr"}>
              {previewDoc ? (
                <div className="border rounded-md p-4 bg-background">
                  <LegalDocLayout
                    doc={previewDoc}
                    language={language}
                    effectiveDate={effectiveDate}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Fix the JSON in the Edit tab to preview.
                </p>
              )}
            </TabsContent>

            <TabsContent value="history" className="pt-4">
              {!versions || versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No prior versions yet — this document hasn't been republished.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>Published by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((v) => (
                      <TableRow key={v.id} data-testid={`row-legal-version-${v.version}`}>
                        <TableCell>v{v.version}</TableCell>
                        <TableCell className="text-sm">{v.effectiveDate}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(v.publishedAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {v.publishedBy ?? "system"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-legal-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => publish.mutate()}
            disabled={!parsedBlocks || publish.isPending}
            data-testid="button-legal-publish"
          >
            {publish.isPending ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
