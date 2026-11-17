"use client";

/**
 * Admin job-form editor for one application.
 *
 * Loads the app's merged template (base + drop-ins) and lets an admin edit the
 * `fields` and `parameters` sections through a structured editor, a raw JSON
 * view, and a live preview of the form users will see on the Compute page.
 * Saving writes a `95-admin.json` drop-in override in the site folder; Reset
 * deletes it. Details and Parser tabs save separately. Everything applies
 * immediately, with no restart.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Plus, Trash2, Save, RotateCcw, Eye, Braces, ListPlus, SlidersHorizontal, Layers,
  ArrowUp, ArrowDown, Copy, Info, LineChart,
} from "lucide-react";
import { AppDetails } from "./app-details";
import { AddFieldDialog } from "./add-field-dialog";
import { applyPreset, fieldUsage } from "@/lib/field-presets";
import { useAppInfo } from "@/hooks/use-cluster";
import { ParserEditor } from "./parser-editor";
import { AppIcon } from "@/components/compute/app-icon";
import { toast } from "sonner";
import { fetchJson } from "@/lib/fetch-json";

/** Template field types, with the names admins see. */
const FIELD_TYPES = [
  ["textField", "Text"],
  ["radioButtons", "Choice (one of)"],
  ["checkBoxes", "Tick boxes (several)"],
  ["checkbox", "Yes / no"],
  ["file", "File"],
] as const;

const selectCls =
  "flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm";
const textareaCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono";


interface Draft {
  fields: Record<string, any>;
  parameters: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Small generic editors
// ---------------------------------------------------------------------------

/** Edit one JSON value: plain input for strings/numbers, textarea-JSON otherwise. */
function ValueEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  if (typeof value === "string" || typeof value === "number") {
    return (
      <Input
        value={String(value)}
        onChange={(e) =>
          onChange(typeof value === "number" && e.target.value !== "" && !isNaN(Number(e.target.value))
            ? Number(e.target.value)
            : e.target.value)
        }
      />
    );
  }
  return <JsonArea value={value} onChange={onChange} rows={Math.min(8, 2 + JSON.stringify(value, null, 2).split("\n").length)} />;
}

/** Textarea bound to a JSON value; commits on blur, flags parse errors. */
function JsonArea({ value, onChange, rows = 6 }: { value: any; onChange: (v: any) => void; rows?: number }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the bound value changes from outside (adjust-during-render pattern).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(JSON.stringify(value, null, 2));
    setError(null);
  }

  return (
    <div>
      <textarea
        className={`${textareaCls} ${error ? "border-destructive" : ""}`}
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setError(null);
          } catch (e: any) {
            setError(e.message);
          }
        }}
      />
      {error && <p className="text-xs text-destructive mt-1">Invalid JSON: {error}</p>}
    </div>
  );
}

/** Key/value object editor — strings inline, complex values as JSON. */
function KeyValueEditor({
  obj, onChange, addLabel = "Add entry",
}: {
  obj: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  addLabel?: string;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(obj ?? {});

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No entries.</p>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start gap-2">
          <span className="font-mono text-sm pt-2 w-44 shrink-0 truncate" title={k}>{k}</span>
          <div className="flex-1">
            <ValueEditor value={v} onChange={(nv) => onChange({ ...obj, [k]: nv })} />
          </div>
          <Button
            aria-label={`Remove ${k}`}
            variant="ghost" size="icon"
            onClick={() => { const next = { ...obj }; delete next[k]; onChange(next); }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          placeholder="new key"
          className="w-44 font-mono"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <Button
          variant="outline" size="sm"
          disabled={!newKey.trim() || newKey in (obj ?? {})}
          onClick={() => { onChange({ ...obj, [newKey.trim()]: "" }); setNewKey(""); }}
        >
          <Plus className="mr-1 h-4 w-4" /> {addLabel}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field editor
// ---------------------------------------------------------------------------

function RadioOptionsEditor({
  radios, onChange,
}: {
  radios: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}) {
  const [newKey, setNewKey] = useState("");
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Options</Label>
      {Object.entries(radios ?? {}).map(([k, opt]: [string, any]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="font-mono text-xs w-24 shrink-0 truncate" title={k}>{k}</span>
          <Input
            placeholder="Caption"
            value={opt?.caption ?? ""}
            onChange={(e) => onChange({ ...radios, [k]: { ...opt, caption: e.target.value } })}
          />
          <Input
            placeholder="Value"
            className="font-mono"
            value={opt?.value ?? ""}
            onChange={(e) => onChange({ ...radios, [k]: { ...opt, value: e.target.value } })}
          />
          <Button aria-label={`Remove option ${k}`} variant="ghost" size="icon"
            onClick={() => { const next = { ...radios }; delete next[k]; onChange(next); }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input placeholder="option key" className="w-32 font-mono" value={newKey}
          onChange={(e) => setNewKey(e.target.value)} />
        <Button variant="outline" size="sm" disabled={!newKey.trim() || newKey in (radios ?? {})}
          onClick={() => { onChange({ ...(radios ?? {}), [newKey.trim()]: { caption: "", value: "" } }); setNewKey(""); }}>
          <Plus className="mr-1 h-4 w-4" /> Add option
        </Button>
      </div>
    </div>
  );
}

function FieldCard({
  id, field, usage, onAddToCommand, onChange, onRemove, onMove, onDuplicate, first, last,
}: {
  id: string;
  field: any;
  /** How the field reaches the job (scheduler option, command) or that it does not yet. */
  usage: { used: boolean; text: string };
  onAddToCommand: () => void;
  onChange: (next: any) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  first: boolean;
  last: boolean;
}) {
  const [showJson, setShowJson] = useState(false);
  const type = field?.type ?? "textField";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono font-medium">{id}</span>
          <select
            aria-label={`Type of ${id}`}
            className={selectCls}
            value={type}
            onChange={(e) => onChange({ ...field, type: e.target.value })}
          >
            {FIELD_TYPES.map(([t, label]) => <option key={t} value={t}>{label}</option>)}
          </select>
          {field?.required && <Badge variant="secondary" className="text-xs">required</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button aria-label={`Move ${id} up`} variant="ghost" size="icon" disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button aria-label={`Move ${id} down`} variant="ghost" size="icon" disabled={last} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button aria-label={`Duplicate ${id}`} variant="ghost" size="icon" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowJson((s) => !s)}>
            <Braces className="mr-1 h-4 w-4" /> {showJson ? "Form" : "JSON"}
          </Button>
          <Button aria-label={`Remove field ${id}`} variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className={`flex flex-wrap items-center gap-2 text-xs ${usage.used ? "text-muted-foreground" : "text-warning-text"}`}>
          {usage.text}
          {!usage.used && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={onAddToCommand}>
              Add to command
            </Button>
          )}
        </p>
        {showJson ? (
          <JsonArea value={field} onChange={onChange} rows={10} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Label</Label>
                <Input value={field?.label ?? ""} onChange={(e) => onChange({ ...field, label: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Caption / help text</Label>
                <Input value={field?.caption ?? ""} onChange={(e) => onChange({ ...field, caption: e.target.value })} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!field?.required}
                onChange={(e) => onChange({ ...field, required: e.target.checked })}
              />
              Required
            </label>

            {type === "radioButtons" && (
              <RadioOptionsEditor
                radios={field?.radios ?? {}}
                onChange={(radios) => onChange({ ...field, radios })}
              />
            )}
            {type === "checkBoxes" && (
              <RadioOptionsEditor
                radios={field?.checks ?? {}}
                onChange={(checks) => onChange({ ...field, checks })}
              />
            )}
            {type === "checkbox" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Value when checked</Label>
                  <Input className="font-mono" value={field?.value?.true ?? ""}
                    onChange={(e) => onChange({ ...field, value: { ...field?.value, true: e.target.value } })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Value when unchecked</Label>
                  <Input className="font-mono" value={field?.value?.false ?? ""}
                    onChange={(e) => onChange({ ...field, value: { ...field?.value, false: e.target.value } })} />
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Preview — approximation of what the Compute job form renders
// ---------------------------------------------------------------------------

function FieldPreview({ id, field, defaults }: { id: string; field: any; defaults: Record<string, any> }) {
  const def = defaults?.[id];
  switch (field?.type) {
    case "radioButtons":
      return (
        <div className="space-y-1">
          <Label>{field.label || id}{field.required && <span className="text-destructive"> *</span>}</Label>
          <div className="flex flex-wrap gap-4">
            {Object.entries(field.radios ?? {}).map(([k, opt]: [string, any]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`prev-${id}`} defaultChecked={def === opt?.value} readOnly />
                {opt?.caption || k}
              </label>
            ))}
          </div>
        </div>
      );
    case "checkBoxes":
      return (
        <div className="space-y-1">
          <Label>{field.label || id}</Label>
          <div className="flex flex-col gap-1">
            {Object.entries(field.checks ?? {}).map(([k, opt]: [string, any]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" readOnly /> {opt?.caption || k}
              </label>
            ))}
          </div>
        </div>
      );
    case "checkbox":
      return (
        <div className="space-y-1">
          <Label>{field.label || id}</Label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={def === field?.value?.true && def !== ""} readOnly />
            {field.caption || id}
          </label>
        </div>
      );
    case "file":
      return (
        <div className="space-y-1">
          <Label>{field.label || id}{field.required && <span className="text-destructive"> *</span>}</Label>
          <input type="file" className="text-sm" disabled />
          {field.caption && <p className="text-xs text-muted-foreground">{field.caption}</p>}
        </div>
      );
    default: // textField
      return (
        <div className="space-y-1">
          <Label>{field.label || id}{field.required && <span className="text-destructive"> *</span>}</Label>
          <Input placeholder={field.caption || ""} defaultValue={typeof def === "string" ? def : ""} />
        </div>
      );
  }
}

function FormPreview({ draft, appName }: { draft: Draft; appName: string }) {
  const defaults = draft.parameters?.default ?? {};
  const versions = Object.keys(draft.parameters?.appBinaries ?? {});
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">User-facing form preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Job Name</Label>
            <Input defaultValue={appName} />
          </div>
          <div className="space-y-1">
            <Label>Queue</Label>
            <select className={`${selectCls} w-full h-10`}><option>Default</option></select>
          </div>
          <div className="space-y-1">
            <Label>Processors</Label>
            <Input type="number" defaultValue={1} />
          </div>
        </div>
        {versions.length > 0 && (
          <div className="space-y-1 max-w-xs">
            <Label>Version</Label>
            <select className={`${selectCls} w-full h-10`}>
              {versions.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
        )}
        {Object.keys(draft.fields ?? {}).length > 0 && <hr />}
        {Object.entries(draft.fields ?? {}).map(([id, field]) => (
          <FieldPreview key={id} id={id} field={field} defaults={defaults} />
        ))}
        {draft.parameters?.mainCommand && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Generated command template</Label>
            <pre className="rounded-md bg-muted px-3 py-2 text-xs overflow-x-auto">{draft.parameters.mainCommand}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

/** Object key order is the form order, so moving a field rebuilds the object. */
function moveKey(obj: Record<string, any>, key: string, delta: -1 | 1) {
  const keys = Object.keys(obj);
  const i = keys.indexOf(key);
  const j = i + delta;
  if (j < 0 || j >= keys.length) return obj;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

function insertAfter(obj: Record<string, any>, after: string, key: string, value: any) {
  return Object.fromEntries(Object.entries(obj).flatMap(([k, v]) => (k === after ? [[k, v], [key, value]] : [[k, v]])));
}

export function JobFormEditor({ domain, appName, onDeleted }: { domain: string; appName: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const url = `/api/admin/apps/${domain}/${appName}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-app-form", domain, appName],
    queryFn: () => fetchJson(url),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const { data: info } = useAppInfo();

  // (Re)initialize the draft whenever a fresh form arrives (initial load, save, reset).
  const [loadedForm, setLoadedForm] = useState<any>(null);
  if (data?.form && data.form !== loadedForm) {
    setLoadedForm(data.form);
    setDraft({
      fields: structuredClone(data.form.fields ?? {}),
      parameters: structuredClone(data.form.parameters ?? {}),
    });
  }

  const original = useMemo(
    () => data?.form ? JSON.stringify({ fields: data.form.fields ?? {}, parameters: data.form.parameters ?? {} }) : "",
    [data],
  );
  const dirty = draft ? JSON.stringify(draft) !== original : false;

  const save = useMutation({
    mutationFn: () => fetchJson(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    }),
    onSuccess: () => {
      toast.success("Job form saved");
      qc.invalidateQueries({ queryKey: ["admin-app-form", domain, appName] });
      qc.invalidateQueries({ queryKey: ["app-form", domain, appName] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: () => fetchJson(url, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Reverted to template defaults");
      qc.invalidateQueries({ queryKey: ["admin-app-form", domain, appName] });
      qc.invalidateQueries({ queryKey: ["app-form", domain, appName] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center h-64">
        {error
          ? <p className="text-destructive text-sm">{(error as Error).message}</p>
          : <Loader2 className="h-6 w-6 animate-spin" />}
      </div>
    );
  }

  const meta = data.meta ?? {};
  const setFields = (fields: Record<string, any>) => setDraft((d) => d && { ...d, fields });
  const setParams = (parameters: Record<string, any>) => setDraft((d) => d && { ...d, parameters });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <AppIcon logo={meta.logo} size={28} />
            <h3 className="text-lg font-semibold">{meta.name || appName}</h3>
            {meta.hidden && <Badge variant="outline" className="text-xs">Hidden</Badge>}
            {meta.origin === "site" && <Badge variant="outline" className="text-xs">Added here</Badge>}
            <Badge variant="outline" className="text-xs font-mono">{domain}/{appName}</Badge>
            {data.override && <Badge className="text-xs">Form customized</Badge>}
            {dirty && <Badge variant="secondary" className="text-xs">Unsaved changes</Badge>}
          </div>
          {meta.description && <p className="text-sm text-muted-foreground">{meta.description}</p>}
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {data.layers?.base === "site" ? "Site template" : "Shipped template"}
            {data.layers?.dropins?.length > 0 && <> + {data.layers.dropins.join(", ")}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.override && (
            <Button
              variant="outline" size="sm"
              disabled={reset.isPending}
              onClick={() => {
                if (confirm("Remove the admin override and revert this form to its template defaults?")) reset.mutate();
              }}
            >
              {reset.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Reset to defaults
            </Button>
          )}
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save form
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" aria-hidden /> Changes apply as soon as you save. No restart needed.
      </p>

      <Tabs defaultValue="details">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="details"><Info className="mr-1 h-4 w-4" /> Details</TabsTrigger>
          <TabsTrigger value="fields"><ListPlus className="mr-1 h-4 w-4" /> Fields</TabsTrigger>
          <TabsTrigger value="parameters"><SlidersHorizontal className="mr-1 h-4 w-4" /> Parameters</TabsTrigger>
          <TabsTrigger value="parser"><LineChart className="mr-1 h-4 w-4" /> Parser</TabsTrigger>
          <TabsTrigger value="json"><Braces className="mr-1 h-4 w-4" /> JSON</TabsTrigger>
          <TabsTrigger value="preview"><Eye className="mr-1 h-4 w-4" /> Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <AppDetails key={JSON.stringify(meta)} domain={domain} appName={appName} meta={meta} onDeleted={onDeleted} />
        </TabsContent>

        <TabsContent value="parser">
          <ParserEditor key={JSON.stringify(meta.parser ?? null)} domain={domain} appName={appName} meta={meta} />
        </TabsContent>

        <TabsContent value="fields" className="space-y-3">
          {Object.keys(draft.fields).length === 0 && (
            <p className="text-sm text-muted-foreground">This form has no extra fields yet. Use &quot;Add to form&quot; to pick one.</p>
          )}
          {Object.entries(draft.fields).map(([id, field], i, all) => (
            <FieldCard
              key={id}
              id={id}
              field={field}
              first={i === 0}
              last={i === all.length - 1}
              usage={fieldUsage(id, field, draft.parameters)}
              onAddToCommand={() =>
                setParams({ ...draft.parameters, mainCommand: `${draft.parameters.mainCommand ?? ""} (VAR.${id})`.trim() })
              }
              onChange={(next) => setFields({ ...draft.fields, [id]: next })}
              onRemove={() => { const next = { ...draft.fields }; delete next[id]; setFields(next); }}
              onMove={(delta) => setFields(moveKey(draft.fields, id, delta))}
              onDuplicate={() => {
                let n = 2;
                while (`${id}${n}` in draft.fields) n++;
                setFields(insertAfter(draft.fields, id, `${id}${n}`, structuredClone(field)));
              }}
            />
          ))}
          <AddFieldDialog
            draft={draft}
            manager={info?.manager}
            onAdd={(preset) => {
              setDraft((d) => d && applyPreset(d, preset));
              toast.success(`${preset.title} added. Save the form to apply it.`);
            }}
          />
        </TabsContent>

        <TabsContent value="parameters" className="space-y-4">
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Main command</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea
                className={textareaCls}
                rows={3}
                value={draft.parameters.mainCommand ?? ""}
                onChange={(e) => setParams({ ...draft.parameters, mainCommand: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="font-mono">VAR.&lt;field&gt;</code> placeholders — e.g.{" "}
                <code className="font-mono">VAR.appBinaries</code>, <code className="font-mono">VAR.numProcs</code>,
                form field keys, and <code className="font-mono">(-i &quot;VAR.inputFileName&quot;)</code> for optional groups.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Default values</CardTitle></CardHeader>
            <CardContent>
              <KeyValueEditor
                obj={draft.parameters.default ?? {}}
                onChange={(d) => setParams({ ...draft.parameters, default: d })}
                addLabel="Add default"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Application binaries (versions)</CardTitle></CardHeader>
            <CardContent>
              <KeyValueEditor
                obj={draft.parameters.appBinaries ?? {}}
                onChange={(b) => setParams({ ...draft.parameters, appBinaries: b })}
                addLabel="Add version"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-base">Options</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!draft.parameters.options?.allowWriteScript}
                  onChange={(e) =>
                    setParams({
                      ...draft.parameters,
                      options: { ...draft.parameters.options, allowWriteScript: e.target.checked },
                    })
                  }
                />
                Allow users to write the input script in the browser
              </label>
              <div>
                <Label className="text-xs text-muted-foreground">Prologue commands (one per line)</Label>
                <textarea
                  className={textareaCls}
                  rows={3}
                  value={(draft.parameters.prologueCommands ?? []).join("\n")}
                  onChange={(e) =>
                    setParams({
                      ...draft.parameters,
                      prologueCommands: e.target.value === "" ? [] : e.target.value.split("\n"),
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="json">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-2">
                Full editable template (fields + parameters). Changes here are reflected in the other tabs.
              </p>
              <JsonArea value={draft} onChange={(v) => {
                if (v && typeof v === "object" && !Array.isArray(v)) {
                  setDraft({ fields: v.fields ?? {}, parameters: v.parameters ?? {} });
                }
              }} rows={24} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <FormPreview draft={draft} appName={appName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
