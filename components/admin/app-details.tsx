"use client";

/** Admin → Applications → Details: name, description, tags, logo, type, visibility, export, delete. */

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppIcon } from "@/components/compute/app-icon";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Download, Eye, EyeOff, Loader2, Save, Trash2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/fetch-json";

type AppType = "batch" | "remote" | "both";

const typeOf = (m: any): AppType => (m.nobatch ? "remote" : m.remote ? "both" : "batch");

export function AppDetails({ domain, appName, meta, onDeleted }: {
  domain: string;
  appName: string;
  meta: any;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const base = `/api/admin/apps/${domain}/${appName}`;
  const [name, setName] = useState<string>(meta.name ?? appName);
  const [description, setDescription] = useState<string>(meta.description ?? "");
  const [tags, setTags] = useState<string>((meta.tags ?? []).join(", "));
  const [type, setType] = useState<AppType>(typeOf(meta));
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-apps"] });
    qc.invalidateQueries({ queryKey: ["admin-app-form", domain, appName] });
    qc.invalidateQueries({ queryKey: ["app-info"] });
  };

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      fetchJson(`${base}/meta`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }),
    onSuccess: () => { toast.success("Saved. Users see the change now."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return fetchJson(`${base}/logo`, { method: "POST", body: fd });
    },
    onSuccess: () => { toast.success("Logo updated"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => fetchJson(`${base}/meta`, { method: "DELETE" }),
    onSuccess: (r: any) => {
      toast.success(meta.origin === "site" ? "Application deleted" : "Back to the shipped defaults");
      refresh();
      if (!r?.meta) onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDetails = () =>
    save.mutate({
      name,
      description,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      remote: type !== "batch",
      nobatch: type === "remote",
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-muted p-3"><AppIcon logo={meta.logo} size={48} /></div>
            <div className="space-y-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload logo
              </Button>
              <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 512 KB. Square works best.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="app-name">Name</Label>
              <Input id="app-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="app-tags">Tags</Label>
              <Input id="app-tags" placeholder="CFD, ANSYS" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="app-desc">Description</Label>
            <Input id="app-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">How users run it</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {([
                ["batch", "Batch job"],
                ["remote", "Remote desktop only"],
                ["both", "Batch job or remote desktop"],
              ] as const).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name="app-type" checked={type === v} onChange={() => setType(v)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Button size="sm" onClick={saveDetails} disabled={save.isPending || !name.trim()}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save details
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Availability and sharing</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => save.mutate({ hidden: !meta.hidden })} disabled={save.isPending}>
            {meta.hidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
            {meta.hidden ? "Show to users" : "Hide from users"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`${base}/export`} download>
              <Download className="mr-2 h-4 w-4" /> Export
            </a>
          </Button>
          {meta.origin === "site" ? (
            <ConfirmButton
              label="Delete application"
              icon={Trash2}
              confirmText={`Delete ${name}? Its form and settings are removed. Past jobs are kept.`}
              pending={remove.isPending}
              onConfirm={() => remove.mutate()}
            />
          ) : (
            <ConfirmButton
              label="Reset to shipped defaults"
              icon={RotateCcw}
              confirmText="Remove every change made here (details, form, parser choice, logo)?"
              pending={remove.isPending}
              onConfirm={() => remove.mutate()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
