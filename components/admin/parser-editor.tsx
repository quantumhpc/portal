"use client";

/**
 * Admin → Applications → Parser: choose how job output becomes a progress
 * chart, build a regex recipe without code, and test it on a real log.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParserResultView } from "@/components/job-detail/parser-result-view";
import { FileCode2, FlaskConical, Loader2, Plus, Save, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/fetch-json";

type Source = "none" | "builtin" | "recipe" | "file";
interface Ref { source: Source; id?: string }

interface Recipe {
  file?: "outputFile" | "historyFile";
  logScale?: boolean;
  iteration?: { pattern: string };
  series: { pattern: string; label: string; value?: number; firstPerIteration?: boolean }[];
  outputs?: { label: string; pattern: string; type?: "Text" | "Number" | "Time" }[];
  end?: { success?: string; error?: string };
}

const NEW_RECIPE: Recipe = {
  file: "outputFile",
  logScale: true,
  iteration: { pattern: "" },
  series: [{ pattern: "", label: "" }],
  outputs: [],
  end: { success: "", error: "" },
};

const mono = "font-mono text-xs";

/** Drop empty optional parts before saving/testing. */
function clean(r: Recipe): Recipe {
  const out: Recipe = { file: r.file, logScale: !!r.logScale, series: r.series };
  if (r.iteration?.pattern) out.iteration = { pattern: r.iteration.pattern };
  const outputs = (r.outputs ?? []).filter((o) => o.pattern && o.label);
  if (outputs.length) out.outputs = outputs;
  if (r.end?.success || r.end?.error) {
    out.end = {};
    if (r.end.success) out.end.success = r.end.success;
    if (r.end.error) out.end.error = r.end.error;
  }
  return out;
}

function currentRef(meta: any, builtin: string[]): Ref {
  const p = meta?.parser;
  if (p && ["none", "builtin", "recipe", "file"].includes(p.source)) return p;
  return builtin.includes(meta?.appName) ? { source: "builtin", id: meta.appName } : { source: "none" };
}

export function ParserEditor({ domain, appName, meta }: { domain: string; appName: string; meta: any }) {
  const qc = useQueryClient();
  const { data: list } = useQuery({
    queryKey: ["admin-parsers"],
    queryFn: () => fetchJson<{ builtin: string[]; site: { id: string; kind: "recipe" | "file"; error?: string }[]; folder: string }>("/api/admin/parsers"),
  });
  const builtin = list?.builtin ?? [];
  const files = (list?.site ?? []).filter((p) => p.kind === "file");

  const initial = useMemo(() => currentRef(meta, builtin), [meta, builtin]);
  const [ref, setRef] = useState<Ref | null>(null);
  const active = ref ?? initial;
  const recipeId = active.source === "recipe" && active.id ? active.id : `${domain}-${appName}`;

  const { data: loadedRecipe, isFetched } = useQuery({
    queryKey: ["admin-parser-recipe", recipeId],
    queryFn: () => fetchJson<Recipe>(`/api/admin/parsers/${recipeId}`).catch(() => null),
    enabled: active.source === "recipe",
  });
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const draft: Recipe = recipe ?? (isFetched && loadedRecipe ? { ...NEW_RECIPE, ...loadedRecipe } : NEW_RECIPE);
  const set = (patch: Partial<Recipe>) => setRecipe({ ...draft, ...patch });

  const [sample, setSample] = useState("");
  const [samplePath, setSamplePath] = useState("");
  const [result, setResult] = useState<any>(null);

  const test = useMutation({
    mutationFn: () =>
      fetchJson("/api/admin/parsers/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(active.source === "recipe" ? { recipe: clean(draft) } : { ref: active }),
          ...(samplePath ? { path: samplePath } : { sample }),
        }),
      }),
    onSuccess: setResult,
    onError: (e: Error) => { setResult(null); toast.error(e.message); },
  });

  const save = useMutation({
    mutationFn: async () => {
      let parser: Ref = active;
      if (active.source === "recipe") {
        await fetchJson(`/api/admin/parsers/${recipeId}`, {
          method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(clean(draft)),
        });
        parser = { source: "recipe", id: recipeId };
      }
      return fetchJson(`/api/admin/apps/${domain}/${appName}/meta`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ parser }),
      });
    },
    onSuccess: () => {
      toast.success("Parser saved. New job pages use it now.");
      qc.invalidateQueries({ queryKey: ["admin-app-form", domain, appName] });
      qc.invalidateQueries({ queryKey: ["admin-parsers"] });
      qc.invalidateQueries({ queryKey: ["admin-parser-recipe", recipeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = active.source !== "recipe" || draft.series.every((s) => s.pattern && s.label);
  const sampleLines = (samplePath ? "" : sample).split("\n").slice(0, 400);
  const matched = new Set<number>(result?.matchedLines ?? []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Progress chart source</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A parser reads the job&apos;s output while it runs and draws the Progress chart on the job page.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            {([
              ["none", "No chart"],
              ["builtin", "Built-in parser"],
              ["recipe", "Pattern recipe (no code)"],
              ["file", "JavaScript file on the server"],
            ] as const).map(([v, label]) => (
              <label key={v} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="parser-source"
                  checked={active.source === v}
                  onChange={() => { setRef({ source: v, id: v === "builtin" ? builtin[0] : v === "file" ? files[0]?.id : undefined }); setResult(null); }}
                />
                {label}
              </label>
            ))}
          </div>

          {active.source === "builtin" && (
            <div className="space-y-1 max-w-xs">
              <Label htmlFor="builtin-parser">Parser</Label>
              <select id="builtin-parser" className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={active.id ?? ""} onChange={(e) => setRef({ source: "builtin", id: e.target.value })}>
                {builtin.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}

          {active.source === "file" && (
            files.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-start gap-2">
                <FileCode2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  No JavaScript parsers found. Place a <code className={mono}>.js</code> file in{" "}
                  <code className={mono}>{list?.folder}</code> on the server (owned by the portal user, not group- or
                  world-writable). See docs/PARSERS.md.
                </span>
              </p>
            ) : (
              <div className="space-y-2 max-w-md">
                <Label htmlFor="file-parser">File</Label>
                <select id="file-parser" className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={active.id ?? ""} onChange={(e) => setRef({ source: "file", id: e.target.value })}>
                  {files.map((f) => <option key={f.id} value={f.id}>{f.id}.js{f.error ? " (refused)" : ""}</option>)}
                </select>
                {files.find((f) => f.id === active.id)?.error && (
                  <p className="text-xs text-destructive flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {files.find((f) => f.id === active.id)?.error}
                  </p>
                )}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {active.source === "recipe" && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Recipe</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Patterns are JavaScript regular expressions matched against each line. Use ( ) to capture a value.
              Saved as <code className={mono}>{recipeId}.json</code>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="r-iter">Iteration line (optional)</Label>
                <Input id="r-iter" className={mono} placeholder="^Time = ([0-9.]+)"
                  value={draft.iteration?.pattern ?? ""} onChange={(e) => set({ iteration: { pattern: e.target.value } })} />
                <p className="text-xs text-muted-foreground">Sets the x value. Without it, points are numbered.</p>
              </div>
              <div className="space-y-2 pt-6">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!draft.logScale} onChange={(e) => set({ logScale: e.target.checked })} />
                  Plot log10 of the values (residuals)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Read
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={draft.file ?? "outputFile"}
                    onChange={(e) => set({ file: e.target.value as Recipe["file"] })}>
                    <option value="outputFile">the output file</option>
                    <option value="historyFile">the history file</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Series</Label>
              {draft.series.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input aria-label={`Series ${i + 1} pattern`} className={`${mono} flex-1 min-w-[220px]`} placeholder="Solving for (\w+), Initial residual = ([0-9.eE+-]+)"
                    value={s.pattern} onChange={(e) => set({ series: draft.series.map((x, j) => j === i ? { ...x, pattern: e.target.value } : x) })} />
                  <Input aria-label={`Series ${i + 1} label`} className="w-28" placeholder="Label or $1"
                    value={s.label} onChange={(e) => set({ series: draft.series.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                  <Input aria-label={`Series ${i + 1} value group`} type="number" min={1} className="w-20" title="Capture group holding the value"
                    value={s.value ?? 1} onChange={(e) => set({ series: draft.series.map((x, j) => j === i ? { ...x, value: Number(e.target.value) || 1 } : x) })} />
                  <label className="flex items-center gap-1 text-xs" title="Keep only the first match per iteration">
                    <input type="checkbox" checked={!!s.firstPerIteration}
                      onChange={(e) => set({ series: draft.series.map((x, j) => j === i ? { ...x, firstPerIteration: e.target.checked } : x) })} />
                    first per iteration
                  </label>
                  <Button aria-label={`Remove series ${i + 1}`} variant="ghost" size="icon" disabled={draft.series.length === 1}
                    onClick={() => set({ series: draft.series.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Label: fixed text, or $1 to name the series from the first capture. The number is the capture holding the value.</p>
              <Button variant="outline" size="sm" onClick={() => set({ series: [...draft.series, { pattern: "", label: "" }] })}>
                <Plus className="mr-1 h-4 w-4" /> Add series
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Summary values (optional)</Label>
              {(draft.outputs ?? []).map((o, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input aria-label={`Value ${i + 1} label`} className="w-40" placeholder="Run time (s)"
                    value={o.label} onChange={(e) => set({ outputs: draft.outputs!.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                  <Input aria-label={`Value ${i + 1} pattern`} className={`${mono} flex-1 min-w-[200px]`} placeholder="ExecutionTime = ([0-9.]+)"
                    value={o.pattern} onChange={(e) => set({ outputs: draft.outputs!.map((x, j) => j === i ? { ...x, pattern: e.target.value } : x) })} />
                  <select aria-label={`Value ${i + 1} type`} className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={o.type ?? "Text"}
                    onChange={(e) => set({ outputs: draft.outputs!.map((x, j) => j === i ? { ...x, type: e.target.value as "Text" | "Number" } : x) })}>
                    <option value="Text">Text</option>
                    <option value="Number">Number</option>
                  </select>
                  <Button aria-label={`Remove value ${i + 1}`} variant="ghost" size="icon"
                    onClick={() => set({ outputs: draft.outputs!.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set({ outputs: [...(draft.outputs ?? []), { label: "", pattern: "", type: "Number" }] })}>
                <Plus className="mr-1 h-4 w-4" /> Add value
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="r-ok">Finished successfully when a line matches</Label>
                <Input id="r-ok" className={mono} placeholder="^End$" value={draft.end?.success ?? ""}
                  onChange={(e) => set({ end: { ...draft.end, success: e.target.value } })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="r-err">Failed when a line matches</Label>
                <Input id="r-err" className={mono} placeholder="FATAL ERROR" value={draft.end?.error ?? ""}
                  onChange={(e) => set({ end: { ...draft.end, error: e.target.value } })} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {active.source !== "none" && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Test</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sample">Paste a log excerpt</Label>
                <textarea id="sample" rows={10} disabled={!!samplePath}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  value={sample} onChange={(e) => setSample(e.target.value)} />
                <Label htmlFor="sample-path">or read a file on the cluster (as your user)</Label>
                <Input id="sample-path" className={mono} placeholder="/home/me/jobs/run1/output.log"
                  value={samplePath} onChange={(e) => setSamplePath(e.target.value)} />
                <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending || (!sample && !samplePath)}>
                  {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                  Run test
                </Button>
              </div>
              <div className="min-w-0">
                {result ? <ParserResultView result={result} height={240} /> : (
                  <p className="text-sm text-muted-foreground pt-6">The chart appears here.</p>
                )}
              </div>
            </div>
            {result?.matchedLines && !samplePath && sample && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{matched.size} matching line{matched.size === 1 ? "" : "s"} highlighted</p>
                <pre className="max-h-64 overflow-auto rounded-md border text-xs">
                  {sampleLines.map((l, i) => (
                    <div key={i} className={matched.has(i) ? "bg-primary/15" : ""}>{l || " "}</div>
                  ))}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save parser
      </Button>
    </div>
  );
}
