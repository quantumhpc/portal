"use client";

import { useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  CUSTOM_KINDS, PRESETS, customPreset, presetAdded, type CustomKind, type FieldPreset, type FormDraft,
} from "@/lib/field-presets";

/**
 * "Add to form": pick a ready-made addition (scheduler resource, path, common
 * option) or describe a custom one with a label and its command-line text.
 * Presets for another scheduler than `manager` are left out.
 */
export function AddFieldDialog({ draft, manager, onAdd }: {
  draft: FormDraft;
  manager?: string;
  onAdd: (preset: FieldPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState<CustomKind | null>(null);
  const [label, setLabel] = useState("");
  const [cli, setCli] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (title: string, description: string) => !q || `${title} ${description}`.toLowerCase().includes(q);
  const presets = PRESETS.filter((p) => (!p.scheduler || !manager || p.scheduler === manager) && matches(p.title, p.description));
  const groups = [...new Set(presets.map((p) => p.group))];
  const customKinds = CUSTOM_KINDS.filter((k) => matches(k.title, k.description));

  const add = (preset: FieldPreset, close = false) => {
    onAdd(preset);
    if (close) setOpen(false);
  };
  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) { setQuery(""); setCustom(null); setLabel(""); setCli(""); }
  };

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" /> Add to form</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add to form</DialogTitle>
          <DialogDescription>
            Pick what users should be able to set. Each entry adds the field and connects it to the job, so there is nothing to wire by hand.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search additions" placeholder="Search: memory, GPU, email, module…" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>

        {groups.map((group) => (
          <section key={group} className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h4>
            {presets.filter((p) => p.group === group).map((p) => {
              const added = presetAdded(p, draft);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={added}
                  onClick={() => add(p)}
                  className="flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left hover:bg-accent disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  <span>
                    <span className="block text-sm font-medium">{p.title}</span>
                    <span className="block text-xs text-muted-foreground">{p.description}</span>
                  </span>
                  {added
                    ? <Badge variant="secondary" className="shrink-0"><Check aria-hidden /> Added</Badge>
                    : <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                </button>
              );
            })}
          </section>
        ))}

        {customKinds.length > 0 && (
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your own option</h4>
            {customKinds.map((k) => (
              <div key={k.kind} className="rounded-md border">
                <button
                  type="button"
                  aria-expanded={custom === k.kind}
                  onClick={() => { setCustom(custom === k.kind ? null : k.kind); setLabel(""); setCli(""); }}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-accent"
                >
                  <span>
                    <span className="block text-sm font-medium">{k.title}</span>
                    <span className="block text-xs text-muted-foreground">{k.description}</span>
                  </span>
                  <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
                {custom === k.kind && (
                  <form
                    className="grid grid-cols-1 gap-3 border-t p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (label.trim()) add(customPreset(k.kind, label.trim(), cli, draft.fields), true);
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="custom-label" className="text-xs">Name shown to users</Label>
                      <Input id="custom-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Iterations" autoFocus />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="custom-cli" className="text-xs">{k.cliLabel}</Label>
                      <Input id="custom-cli" className="font-mono" value={cli} onChange={(e) => setCli(e.target.value)} placeholder={k.cliHint} />
                    </div>
                    <Button type="submit" disabled={!label.trim() || (k.kind === "flag" && !cli.trim())}>Add</Button>
                  </form>
                )}
              </div>
            ))}
          </section>
        )}

        {presets.length === 0 && customKinds.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing matches &quot;{query}&quot;.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
