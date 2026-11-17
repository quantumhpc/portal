"use client";

/**
 * Admin → Applications: add, import, edit, hide and share the applications
 * users see on the Compute page. Changes apply immediately.
 */

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Search, AppWindow, Plus, Upload, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { JobFormEditor } from "@/components/admin/job-form-editor";
import { AppIcon } from "@/components/compute/app-icon";
import { fetchJson } from "@/lib/fetch-json";

interface AppEntry {
  appDomain: string;
  appName: string;
  name: string;
  logo?: string;
  description?: string;
  tags?: string[];
  hidden?: boolean;
  origin?: "shipped" | "site";
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "").slice(0, 64);

function NewAppDialog({ apps, onCreated }: { apps: AppEntry[]; onCreated: (domain: string, app: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [id, setId] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const domains = useMemo(() => [...new Set(apps.map((a) => a.appDomain))].sort(), [apps]);
  const appId = id || slug(name);

  const create = useMutation({
    mutationFn: () => {
      const [cd, ca] = cloneFrom ? cloneFrom.split("/") : [];
      return fetchJson("/api/admin/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, app: appId, name, ...(cloneFrom ? { cloneFrom: { domain: cd, app: ca } } : {}) }),
      });
    },
    onSuccess: () => {
      toast.success(`${name} created. Add its fields and command next.`);
      qc.invalidateQueries({ queryKey: ["admin-apps"] });
      qc.invalidateQueries({ queryKey: ["app-info"] });
      onCreated(domain, appId);
      setOpen(false);
      setName(""); setId(""); setCloneFrom("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1"><Plus className="mr-1 h-4 w-4" /> New</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>Users see it on the Compute page as soon as it is created.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="space-y-1">
            <Label htmlFor="na-name">Name</Label>
            <Input id="na-name" autoFocus placeholder="My Solver 2025" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="na-domain">Category</Label>
              <Input id="na-domain" list="na-domains" placeholder="cfd" value={domain} onChange={(e) => setDomain(slug(e.target.value))} />
              <datalist id="na-domains">{domains.map((d) => <option key={d} value={d} />)}</datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="na-id">Id</Label>
              <Input id="na-id" className="font-mono" placeholder={slug(name) || "my_solver"} value={id} onChange={(e) => setId(slug(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="na-clone">Start from</Label>
            <select id="na-clone" className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
              <option value="">An empty form</option>
              {apps.map((a) => (
                <option key={`${a.appDomain}/${a.appName}`} value={`${a.appDomain}/${a.appName}`}>A copy of {a.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={!name.trim() || !domain || !appId || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminAppsPage() {
  const qc = useQueryClient();
  const { data: apps, isLoading } = useQuery<AppEntry[]>({
    queryKey: ["admin-apps"],
    queryFn: () => fetchJson("/api/admin/apps"),
  });

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ domain: string; app: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const importApp = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const post = (overwrite: boolean) =>
        fetchJson<{ domain: string; app: string }>(`/api/admin/apps/import${overwrite ? "?overwrite=1" : ""}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: text,
        });
      try {
        return await post(false);
      } catch (e) {
        if (/already exists/.test((e as Error).message) && window.confirm(`${(e as Error).message}. Replace it?`)) return post(true);
        throw e;
      }
    },
    onSuccess: (r) => {
      toast.success("Application imported");
      qc.invalidateQueries({ queryKey: ["admin-apps"] });
      qc.invalidateQueries({ queryKey: ["app-info"] });
      setSelected({ domain: r.domain, app: r.app });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const src = Array.isArray(apps) ? apps : [];
    const q = search.toLowerCase();
    const filtered = q
      ? src.filter((a) =>
          [a.name, a.appName, a.appDomain, a.description].filter(Boolean).join(" ").toLowerCase().includes(q))
      : src;
    const byDomain: Record<string, AppEntry[]> = {};
    for (const a of filtered) (byDomain[a.appDomain] = byDomain[a.appDomain] || []).push(a);
    return byDomain;
  }, [apps, search]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <NewAppDialog apps={apps ?? []} onCreated={(domain, app) => setSelected({ domain, app })} />
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importApp.mutate(f); e.target.value = ""; }} />
            <Button size="sm" variant="outline" className="flex-1" disabled={importApp.isPending} onClick={() => importRef.current?.click()}>
              {importApp.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Import
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              aria-label="Search applications"
              placeholder="Search applications…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No applications match.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([domain, list]) => (
                <div key={domain}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{domain}</p>
                  <div className="space-y-0.5">
                    {list.map((a) => {
                      const active = selected?.domain === a.appDomain && selected?.app === a.appName;
                      return (
                        <button
                          key={`${a.appDomain}/${a.appName}`}
                          onClick={() => setSelected({ domain: a.appDomain, app: a.appName })}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                            a.hidden && !active && "text-muted-foreground",
                          )}
                        >
                          <AppIcon logo={a.logo} size={20} />
                          <span className="truncate">{a.name || a.appName}</span>
                          {a.hidden && <EyeOff className="ml-auto h-3.5 w-3.5 shrink-0" aria-label="Hidden from users" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <JobFormEditor
          key={`${selected.domain}/${selected.app}`}
          domain={selected.domain}
          appName={selected.app}
          onDeleted={() => setSelected(null)}
        />
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={AppWindow}
              title="Select an application"
              description="Pick an application on the left to edit its details, job form, command and progress parser, or create a new one. Changes apply as soon as you save, with no restart."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
