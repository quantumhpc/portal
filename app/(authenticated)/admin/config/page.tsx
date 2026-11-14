"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RefreshCw, Plus, X, Info, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// ── helpers ──────────────────────────────────────────────────────────────────

function RestartBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
      <RotateCcw className="h-3 w-3" aria-hidden /> needs restart
    </span>
  );
}

function Field({
  label, help, children,
}: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder, mono, type,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <Input
      type={type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={mono ? "font-mono text-sm" : ""}
    />
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="font-mono text-sm"
    />
  );
}

function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function SelectInput({
  value, options, onChange,
}: { value: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <select
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function TagList({
  values, onChange, placeholder,
}: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");

  function add() {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 min-h-[2rem] p-2 border rounded-md bg-background">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 font-mono text-xs">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {values.length === 0 && (
          <span className="text-muted-foreground text-xs self-center">No entries</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder ?? "Add value…"}
          className="font-mono text-sm h-8"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ── License server editor ─────────────────────────────────────────────────────

interface LicServer { type: string; url: [string, string] }
type LicServers = Record<string, LicServer>;

function LicServerEditor({
  servers, onChange,
}: { servers: LicServers; onChange: (v: LicServers) => void }) {
  const entries = Object.entries(servers);

  function update(name: string, field: "name" | "type" | "server" | "logfile", val: string) {
    const next: LicServers = { ...servers };
    if (field === "name") {
      const existing = next[name];
      delete next[name];
      next[val] = existing;
    } else {
      const s = { ...next[name] };
      if (field === "type") s.type = val;
      else if (field === "server") s.url = [val, s.url[1]];
      else if (field === "logfile") s.url = [s.url[0], val];
      next[name] = s;
    }
    onChange(next);
  }

  function remove(name: string) {
    const next = { ...servers };
    delete next[name];
    onChange(next);
  }

  function add() {
    const name = `server${entries.length + 1}`;
    onChange({ ...servers, [name]: { type: "flexlm", url: ["", ""] } });
  }

  return (
    <div className="space-y-3">
      {entries.map(([name, s]) => (
        <div key={name} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
          <Field label="Name">
            <TextInput value={name} onChange={(v) => update(name, "name", v)} mono />
          </Field>
          <Field label="Type">
            <SelectInput
              value={s.type}
              options={[
                { label: "FlexLM", value: "flexlm" },
                { label: "RLM", value: "rlm" },
                { label: "LMX", value: "lmx" },
              ]}
              onChange={(v) => update(name, "type", v)}
            />
          </Field>
          <Field label="Server / URL">
            <TextInput value={s.url[0]} onChange={(v) => update(name, "server", v)} mono />
          </Field>
          <Field label="Log file path">
            <TextInput value={s.url[1]} onChange={(v) => update(name, "logfile", v)} mono />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mb-0.5"
            onClick={() => remove(name)}
          >
            <X className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> Add license server
      </Button>
    </div>
  );
}

// ── Manager block editor ──────────────────────────────────────────────────────

interface ManagerCfg {
  serverName?: string;
  method?: string;
  defaultOpts?: string;
  sshExec?: string;
  scpExec?: string;
  localShell?: string;
  localCopy?: string;
  binariesDir?: string;
  useAlternate?: boolean;
  useSharedDir?: boolean;
  sharedDir?: string;
  workingDir?: string;
  userParams?: string[];
}

function ManagerEditor({
  label, value, onChange,
}: { label: string; value: ManagerCfg; onChange: (v: ManagerCfg) => void }) {
  function set<K extends keyof ManagerCfg>(k: K, v: ManagerCfg[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h4 className="font-medium text-sm">{label}</h4>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Head node hostname / IP">
          <TextInput
            value={value.serverName ?? ""}
            onChange={(v) => set("serverName", v)}
            placeholder="172.17.0.1"
            mono
          />
        </Field>
        <Field label="Connection method">
          <SelectInput
            value={value.method ?? "ssh"}
            options={[{ label: "SSH", value: "ssh" }, { label: "Local", value: "local" }]}
            onChange={(v) => set("method", v)}
          />
        </Field>
        <Field label="SSH options">
          <TextInput
            value={value.defaultOpts ?? ""}
            onChange={(v) => set("defaultOpts", v)}
            placeholder="-o StrictHostKeyChecking=no"
            mono
          />
        </Field>
        <Field label="Binaries directory">
          <TextInput
            value={value.binariesDir ?? ""}
            onChange={(v) => set("binariesDir", v)}
            placeholder="/opt/slurm/bin/"
            mono
          />
        </Field>
        <Field label="SSH executable">
          <TextInput value={value.sshExec ?? ""} onChange={(v) => set("sshExec", v)} mono placeholder="/usr/bin/ssh" />
        </Field>
        <Field label="SCP executable">
          <TextInput value={value.scpExec ?? ""} onChange={(v) => set("scpExec", v)} mono placeholder="/usr/bin/scp" />
        </Field>
        <Field label="Local shell">
          <TextInput value={value.localShell ?? ""} onChange={(v) => set("localShell", v)} mono placeholder="/bin/sh" />
        </Field>
        <Field label="Local copy command">
          <TextInput value={value.localCopy ?? ""} onChange={(v) => set("localCopy", v)} mono placeholder="/bin/cp" />
        </Field>
        <Field label="Working directory">
          <TextInput value={value.workingDir ?? ""} onChange={(v) => set("workingDir", v)} mono />
        </Field>
        <Field label="Shared directory">
          <TextInput value={value.sharedDir ?? ""} onChange={(v) => set("sharedDir", v)} mono />
        </Field>
      </div>
      <div className="flex gap-6">
        <Toggle
          checked={!!value.useAlternate}
          onChange={(v) => set("useAlternate", v)}
          label="Use alternate execution"
        />
        <Toggle
          checked={!!value.useSharedDir}
          onChange={(v) => set("useSharedDir", v)}
          label="Use shared directory"
        />
      </div>
      <Field label="User parameters (injected into HPC environment)">
        <TagList
          values={value.userParams ?? []}
          onChange={(v) => set("userParams", v)}
          placeholder="e.g. username, uid, gid…"
        />
      </Field>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Cfg = Record<string, any>;

async function fetchConfig(): Promise<Cfg> {
  const res = await fetch("/api/admin/config");
  if (!res.ok) throw new Error("Failed to load config");
  return res.json();
}

async function saveConfig(cfg: Cfg): Promise<void> {
  const res = await fetch("/api/admin/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Save failed");
  }
}

export default function ConfigPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConfig();
      setCfg(data);
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function patch(update: Partial<Cfg>) {
    setCfg((prev) => prev ? { ...prev, ...update } : prev);
    setDirty(true);
  }

  function patchManagers(manager: string, value: ManagerCfg) {
    setCfg((prev) => {
      if (!prev) return prev;
      return { ...prev, managers: { ...(prev.managers ?? {}), [manager]: value } };
    });
    setDirty(true);
  }

  function patchDb(update: Partial<Cfg>) {
    setCfg((prev) => {
      if (!prev) return prev;
      return { ...prev, db: { ...(prev.db ?? {}), ...update } };
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!cfg) return;
    setSaving(true);
    try {
      await saveConfig(cfg);
      toast.success("Configuration saved and applied. Portal and Database settings apply after a restart.");
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!cfg) return null;

  const db = cfg.db ?? {};
  const managers = cfg.managers ?? {};

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          Changes apply as soon as you save, with no restart, except the two sections marked <RestartBadge />. Saved to <code className="font-mono text-xs">config.json</code> in <code className="font-mono text-xs">$QHPC_CONFIG_DIR</code>.
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-3 w-3" /> Reload
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      {/* Portal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">Portal <RestartBadge /></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Port" help="TCP port the server listens on">
              <NumberInput value={cfg.port ?? 8080} onChange={(v) => patch({ port: v })} />
            </Field>
            <Field label="Temporary directory" help="Leave blank to use the OS default">
              <TextInput value={cfg.tmpdir ?? ""} onChange={(v) => patch({ tmpdir: v })} mono placeholder="/tmp" />
            </Field>
          </div>
          <Toggle
            checked={!!cfg.https}
            onChange={(v) => patch({ https: v })}
            label="Enable HTTPS"
          />
          {cfg.https && (
            <div className="grid grid-cols-1 gap-4 ml-6">
              <Field label="Private key path">
                <TextInput value={cfg.ssl_privateKey ?? ""} onChange={(v) => patch({ ssl_privateKey: v })} mono placeholder="ssl/privkey.pem" />
              </Field>
              <Field label="Certificate path">
                <TextInput value={cfg.ssl_certificate ?? ""} onChange={(v) => patch({ ssl_certificate: v })} mono placeholder="ssl/cert.pem" />
              </Field>
              <Field label="Chain file path">
                <TextInput value={cfg.ssl_chainfile ?? ""} onChange={(v) => patch({ ssl_chainfile: v })} mono placeholder="ssl/chain.pem" />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            checked={!!cfg.use_pam}
            onChange={(v) => patch({ use_pam: v })}
            label="Use PAM authentication (disable in dev to accept any OS user)"
          />
          <Field label="PAM service name" help='Common values: "quanta", "system-auth", "su-l"'>
            <TextInput
              value={cfg.pam_module ?? ""}
              onChange={(v) => patch({ pam_module: v })}
              placeholder="quanta"
              mono
            />
          </Field>
          <Field label="Admin users" help="OS usernames granted portal admin rights">
            <TagList
              values={cfg.admin_users ?? []}
              onChange={(v) => patch({ admin_users: v })}
              placeholder="OS username…"
            />
          </Field>
        </CardContent>
      </Card>

      {/* HPC Scheduler */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">HPC Scheduler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Field label="Active scheduler" help='Override at runtime with the HPC_MANAGER environment variable'>
            <SelectInput
              value={cfg.manager ?? "slurm"}
              options={[
                { label: "SLURM", value: "slurm" },
                { label: "PBS", value: "pbs" },
              ]}
              onChange={(v) => patch({ manager: v })}
            />
          </Field>
          <div className="flex gap-6">
            <Toggle
              checked={cfg.memory === true}
              onChange={(v) => patch({ memory: v || undefined })}
              label="Request memory from scheduler"
            />
            {cfg.memory === true && (
              <Field label="Default memory (GB per core)">
                <TextInput
                  value={String(cfg.memory_default ?? "2")}
                  onChange={(v) => patch({ memory_default: v })}
                  mono
                />
              </Field>
            )}
          </div>
          <ManagerEditor
            label="SLURM configuration"
            value={managers.slurm ?? {}}
            onChange={(v) => patchManagers("slurm", v)}
          />
          <ManagerEditor
            label="PBS configuration"
            value={managers.pbs ?? {}}
            onChange={(v) => patchManagers("pbs", v)}
          />
        </CardContent>
      </Card>

      {/* Remote Desktop */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Remote Desktop</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Protocol">
              <SelectInput
                value={cfg.remote ?? "turbovnc"}
                options={[
                  { label: "TurboVNC", value: "turbovnc" },
                  { label: "TigerVNC", value: "tigervnc" },
                  { label: "VirtualGL", value: "virtualgl" },
                ]}
                onChange={(v) => patch({ remote: v })}
              />
            </Field>
            <Field label="Security">
              <SelectInput
                value={cfg.remote_security ?? "none"}
                options={[
                  { label: "None", value: "none" },
                  { label: "One-time password (OTP)", value: "otp" },
                ]}
                onChange={(v) => patch({ remote_security: v })}
              />
            </Field>
          </div>
          <Field
            label="Remote domain"
            help='Domain translation for compute-node hostnames. ".localdomain=.remote.com" replaces domain; ".remote.com" appends.'
          >
            <TextInput
              value={cfg.remote_domain ?? ""}
              onChange={(v) => patch({ remote_domain: v })}
              mono
              placeholder=".localdomain"
            />
          </Field>
        </CardContent>
      </Card>

      {/* License Servers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">License Servers</CardTitle>
        </CardHeader>
        <CardContent>
          <LicServerEditor
            servers={cfg.lic_servers ?? {}}
            onChange={(v) => patch({ lic_servers: v })}
          />
        </CardContent>
      </Card>

      {/* Database */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">Database <RestartBadge /></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Driver">
            <SelectInput
              value={db.driver ?? "mongo"}
              options={[
                { label: "MongoDB", value: "mongo" },
                { label: "SQLite", value: "sqlite" },
              ]}
              onChange={(v) => patchDb({ driver: v })}
            />
          </Field>
          {(db.driver ?? "mongo") === "mongo" ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Hostname">
                <TextInput value={db.hostname ?? ""} onChange={(v) => patchDb({ hostname: v })} mono placeholder="localhost" />
              </Field>
              <Field label="Port">
                <NumberInput value={db.port ?? 27017} onChange={(v) => patchDb({ port: v })} />
              </Field>
              <Field label="Database name">
                <TextInput value={db.database ?? ""} onChange={(v) => patchDb({ database: v })} mono placeholder="quanta" />
              </Field>
              <Field label="Username">
                <TextInput value={db.user ?? ""} onChange={(v) => patchDb({ user: v })} mono />
              </Field>
              <Field label="Password" help="Leave blank if no authentication required">
                <TextInput value={db.password ?? ""} onChange={(v) => patchDb({ password: v })} type="password" mono />
              </Field>
            </div>
          ) : (
            <Field label="Database file" help="Absolute or relative path to the SQLite .db file">
              <TextInput value={db.file ?? ""} onChange={(v) => patchDb({ file: v })} mono placeholder="data/quanta.db" />
            </Field>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save configuration
        </Button>
      </div>
    </div>
  );
}
