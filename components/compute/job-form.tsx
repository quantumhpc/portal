"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bookmark, FileWarning, Info, Loader2, Send, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSaveRun } from "@/hooks/use-jobs";
import { toast } from "sonner";
import { useQueueList } from "@/hooks/use-cluster";
import type { AppTemplate, JobArgs } from "@/lib/hpc/job-template";
import { TemplateFields, UploadStatus, fieldDefaults, fieldHtmlId, missingField, type FieldError } from "./template-fields";
import { defaultJobName, seedArgs } from "./seed-args";
import { useUploads } from "./use-uploads";

interface JobFormProps {
  domain: string;
  appName: string;
  appType: string;
  /** Values from a past job or a saved run; only keys the form knows are used. */
  initial?: JobArgs;
  /** Where `initial` came from, shown above the form. */
  initialLabel?: string;
}

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function JobForm(props: JobFormProps) {
  const { domain, appName, appType } = props;
  const { data: form, isLoading, error } = useQuery<AppTemplate>({
    queryKey: ["app-form", domain, appName, appType],
    queryFn: async () => {
      const res = await fetch(`/api/info?appform=1&domain=${domain}&name=${appName}&type=${appType}`);
      if (!res.ok) throw new Error("Failed to load form");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (error || !form) return <p className="text-sm text-destructive">{(error as Error)?.message ?? "No form"}</p>;
  return <JobFormBody {...props} form={form} />;
}

function JobFormBody({ form, domain, appName, appType, initial, initialLabel }: JobFormProps & { form: AppTemplate }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: queues } = useQueueList();
  const { uploads, start, busy } = useUploads();

  const params = form.parameters ?? {};
  const defaults = params.default ?? {};
  const fields = form.fields ?? {};
  const versions = Object.keys((params.appBinaries as Record<string, string>) ?? {});
  const allowScript = !!params.options?.allowWriteScript;
  const defaultScript = Array.isArray(defaults.scriptCommands)
    ? defaults.scriptCommands.join("\n")
    : String(defaults.scriptCommands ?? "");

  const [jobArgs, setJobArgs] = useState<JobArgs>(() =>
    seedArgs(
      {
        appDomain: domain,
        appName,
        type: appType,
        jobName: defaultJobName(appName),
        numProcs: 1,
        queue: "",
        version: versions[versions.length - 1] ?? "",
        ...fieldDefaults(fields, defaults),
      },
      initial,
      fields,
      versions,
    ),
  );
  const seededScript = allowScript && initial?.inputFileSource === "write";
  const [inputTab, setInputTab] = useState<"upload" | "script">(seededScript ? "script" : "upload");
  const [script, setScript] = useState(seededScript ? String(initial?.scriptCommands ?? "") : defaultScript);
  const [scriptName, setScriptName] = useState(seededScript ? String(initial?.inputFileName ?? "input.txt") : "input.txt");
  const [saveOpen, setSaveOpen] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [confirmNoInput, setConfirmNoInput] = useState(false);
  // Templates that need no input file say so with `default.useinputFile: false`; remote desktops take none.
  const inputOptional = defaults.useinputFile === false || appType === "remote";
  const defaultQueue = Array.isArray(queues)
    ? queues.find((q: any) => q?.default === true || String(q?.default).toUpperCase() === "YES")?.name
    : undefined;
  const [saveName, setSaveName] = useState("");
  const saveRun = useSaveRun();

  /** Form values worth keeping: no uploaded file paths (they don't outlive the upload). */
  const savedValues = (): JobArgs => {
    const out: JobArgs = Object.fromEntries(Object.entries(jobArgs).filter(([k]) => !k.endsWith("[]")));
    if (inputTab === "script" && allowScript) Object.assign(out, { inputFileSource: "write", scriptCommands: script, inputFileName: scriptName });
    return out;
  };

  const save = () =>
    saveRun.mutate(
      { name: saveName.trim(), appDomain: domain, appName, type: appType, jobArgs: savedValues() },
      {
        onSuccess: () => {
          toast.success(`Saved "${saveName.trim()}". Start it again from the Start a job page.`);
          setSaveOpen(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );

  const update = (field: string, value: unknown) => {
    setJobArgs((prev) => ({ ...prev, [field]: value }));
    // Editing the flagged field (or its use/Path companions) clears the message.
    if (fieldError && field.includes(fieldError.id)) setFieldError(null);
  };

  const onFiles = async (id: string, files: File[]) => {
    const paths = await start(id, files);
    if (paths) update(`${id}Path[]`, paths);
  };

  const submitJob = useMutation({
    mutationFn: async (args: JobArgs) => {
      const res = await fetch("/api/manager/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Submission failed");
      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["hpc-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["db-jobs"] });
      toast.success(`Job submitted: ${data.jobId || "Success"}`);
      router.push(data.jobId ? `/job/${encodeURIComponent(data.jobId)}` : "/jobs");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submit = (withoutInput = false) => {
    const payload: JobArgs = { ...jobArgs };
    const input = uploads.inputFile?.paths?.[0];
    if (inputTab === "script" && allowScript) {
      if (!scriptName.trim()) return toast.error("Give the script a file name");
      Object.assign(payload, { useinputFile: true, inputFileSource: "write", inputFileName: scriptName.trim(), scriptCommands: script });
    } else if (input) {
      Object.assign(payload, { useinputFile: true, inputFileSource: "upload", "inputFile[]": input });
    } else {
      payload.useinputFile = false;
    }
    const missing = missingField(fields, payload);
    setFieldError(missing);
    if (missing) {
      const el = document.getElementById(fieldHtmlId(missing.id));
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return toast.error(missing.message);
    }
    if (!payload.useinputFile && !inputOptional && !withoutInput) return setConfirmNoInput(true);
    submitJob.mutate(payload);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {initialLabel && (
        <p className="flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            Filled in from {initialLabel}. Check the values, and attach input files again: files are not copied.
          </span>
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={inputTab} onValueChange={(v) => setInputTab(v as "upload" | "script")}>
            <TabsList>
              <TabsTrigger value="upload">Upload file</TabsTrigger>
              {allowScript && <TabsTrigger value="script">Write script</TabsTrigger>}
            </TabsList>
            <TabsContent value="upload" className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file && !uploads.inputFile?.busy) start("inputFile", [file]);
                }}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Drop the input file for this job here, or choose it</p>
                <input
                  type="file"
                  aria-label="Input file"
                  className="mt-2"
                  disabled={uploads.inputFile?.busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) start("inputFile", [file]);
                  }}
                />
                {uploads.inputFile && (
                  <div className="mt-2">
                    <UploadStatus state={uploads.inputFile} />
                  </div>
                )}
              </div>
            </TabsContent>
            {allowScript && (
              <TabsContent value="script" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="scriptName">File name</Label>
                  <Input id="scriptName" value={scriptName} onChange={(e) => setScriptName(e.target.value)} />
                </div>
                <textarea
                  aria-label="Script"
                  className="w-full h-48 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jobName">Job name</Label>
              <Input id="jobName" value={jobArgs.jobName} onChange={(e) => update("jobName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="queue">Queue</Label>
              <select id="queue" className={selectClass} value={jobArgs.queue} onChange={(e) => update("queue", e.target.value)}>
                <option value="">{defaultQueue ? `Default (${defaultQueue})` : "Default"}</option>
                {Array.isArray(queues) &&
                  queues.map((q: any) => (
                    <option key={q.name || q} value={q.name || q}>
                      {q.name || q}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numProcs">Processors</Label>
              <Input
                id="numProcs"
                type="number"
                min={1}
                value={jobArgs.numProcs}
                onChange={(e) => update("numProcs", Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            {versions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <select id="version" className={selectClass} value={jobArgs.version} onChange={(e) => update("version", e.target.value)}>
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {Object.keys(fields).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Application options</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateFields fields={fields} values={jobArgs} onChange={update} uploads={uploads} onFiles={onFiles} error={fieldError} />
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button
          size="lg"
          variant="outline"
          onClick={() => {
            setSaveName(String(jobArgs.jobName || appName));
            setSaveOpen(true);
          }}
        >
          <Bookmark className="mr-2 h-4 w-4" aria-hidden /> Save set-up
        </Button>
        <Button size="lg" onClick={() => submit()} disabled={submitJob.isPending || busy}>
          {submitJob.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Submit job
        </Button>
      </div>

      <ConfirmButton
        label="Submit without input"
        icon={FileWarning}
        dismissLabel="Go back"
        confirmText="No input file is attached. Most applications fail without one. Submit the job anyway?"
        trigger={null}
        open={confirmNoInput}
        onOpenChange={setConfirmNoInput}
        onConfirm={() => submit(true)}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this set-up</DialogTitle>
            <DialogDescription>
              Keeps the values in this form under a name, so you can start the same job again from the Start a job page. Input files are not saved.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="saveName">Name</Label>
              <Input id="saveName" value={saveName} maxLength={80} onChange={(e) => setSaveName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!saveName.trim() || saveRun.isPending}>
                {saveRun.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
