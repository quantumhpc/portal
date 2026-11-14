"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { evalCondition, type JobArgs, type TemplateField } from "@/lib/hpc/job-template";
import type { UploadState } from "./use-uploads";

/** A required field left empty: its template id and the message to show under it. */
export interface FieldError {
  id: string;
  message: string;
}

/** DOM id of a template field's control, for focus and scroll. */
export const fieldHtmlId = (id: string) => `field-${id}`;

interface TemplateFieldsProps {
  error?: FieldError | null;
  fields: Record<string, TemplateField>;
  values: JobArgs;
  onChange: (id: string, value: unknown) => void;
  uploads: Record<string, UploadState>;
  onFiles: (id: string, files: File[]) => void;
}

const boxClass = "h-4 w-4 rounded border-input accent-primary";

/** Initial form values for template fields, from the template defaults. */
export function fieldDefaults(fields: Record<string, TemplateField>, defaults: Record<string, unknown>): JobArgs {
  const out: JobArgs = {};
  for (const [id, f] of Object.entries(fields)) {
    const d = defaults[id];
    if (f.type === "radioButtons") {
      const first = Object.values(f.radios ?? {})[0]?.value;
      out[id] = typeof d === "string" && !d.includes("VAR.") ? d : f.required ? first ?? "" : "";
    } else if (f.type === "checkbox") {
      out[id] = d !== undefined && d === f.value?.true;
    } else if (f.type === "checkBoxes") {
      out[id] = Array.isArray(d) ? d : [];
    } else if (f.type === "textField") {
      out[id] = typeof d === "string" ? d : "";
      if (f.checkbox) out[`use${id}`] = false;
    } else if (f.type === "file") {
      out[`use${id}`] = !f.switch;
    }
  }
  return out;
}

/** The first required field that is missing, or null. */
export function missingField(fields: Record<string, TemplateField>, values: JobArgs): FieldError | null {
  for (const [id, f] of Object.entries(fields)) {
    if (!f.required || evalCondition(f.disabled, values)) continue;
    const name = f.label ?? id;
    if (f.type === "file") {
      if (values[`use${id}`] && !(values[`${id}Path[]`]?.length)) return { id, message: `${name}: upload a file` };
    } else if (f.type === "radioButtons" || f.type === "textField") {
      if (f.type === "textField" && f.checkbox && !values[`use${id}`]) continue;
      if (!values[id]) return { id, message: `${name} is required` };
    }
  }
  return null;
}

export function TemplateFields({ fields, values, onChange, uploads, onFiles, error }: TemplateFieldsProps) {
  return (
    <div className="space-y-5">
      {Object.entries(fields).map(([id, f]) => {
        const disabled = evalCondition(f.disabled, values);
        const htmlId = fieldHtmlId(id);
        const invalid = error?.id === id;
        const errorId = `${htmlId}-error`;
        const errorText = invalid && (
          <p id={errorId} className="text-sm text-destructive">{error.message}</p>
        );

        if (f.type === "radioButtons") {
          return (
            <fieldset
              key={id}
              id={htmlId}
              tabIndex={-1}
              disabled={disabled}
              aria-describedby={invalid ? errorId : undefined}
              className="space-y-2 disabled:opacity-50"
            >
              <legend className="text-sm font-medium">{f.label ?? id}{f.required && " *"}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {Object.entries(f.radios ?? {}).map(([key, r]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={htmlId}
                      className={boxClass}
                      checked={values[id] === r.value}
                      onChange={() => {
                        onChange(id, r.value);
                        if (f.clear) onChange(f.clear, undefined);
                      }}
                    />
                    {r.caption}
                  </label>
                ))}
              </div>
              {errorText}
            </fieldset>
          );
        }

        if (f.type === "checkbox") {
          return (
            <div key={id} className="space-y-1">
              {f.label && <p className="text-sm font-medium">{f.label}</p>}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={boxClass}
                  disabled={disabled}
                  checked={!!values[id]}
                  onChange={(e) => onChange(id, e.target.checked)}
                />
                {f.caption ?? f.label ?? id}
              </label>
            </div>
          );
        }

        if (f.type === "checkBoxes") {
          const selected: string[] = values[id] ?? [];
          return (
            <fieldset key={id} disabled={disabled} className="space-y-2 disabled:opacity-50">
              <legend className="text-sm font-medium">{f.label ?? id}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {Object.entries(f.checks ?? {}).map(([key, c]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className={boxClass}
                      checked={selected.includes(c.value)}
                      onChange={(e) =>
                        onChange(id, e.target.checked ? [...selected, c.value] : selected.filter((v) => v !== c.value))
                      }
                    />
                    {c.caption}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }

        if (f.type === "textField") {
          const enabled = !f.checkbox || !!values[`use${id}`];
          return (
            <div key={id} className="space-y-2">
              <Label htmlFor={htmlId}>{f.label ?? id}{f.required && " *"}</Label>
              {f.checkbox && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={boxClass}
                    disabled={disabled}
                    checked={!!values[`use${id}`]}
                    onChange={(e) => onChange(`use${id}`, e.target.checked)}
                  />
                  {f.caption ?? "Enable"}
                </label>
              )}
              <Input
                id={htmlId}
                disabled={disabled || !enabled}
                value={values[id] ?? ""}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                onChange={(e) => onChange(id, e.target.value)}
              />
              {errorText}
            </div>
          );
        }

        if (f.type === "file") {
          const on = !!values[`use${id}`];
          const up = uploads[id];
          return (
            <div key={id} className="space-y-2">
              <p className="text-sm font-medium">{f.label ?? id}{f.required && on && " *"}</p>
              {f.sublabel && <p className="text-xs text-muted-foreground">{f.sublabel}</p>}
              {f.switch && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={boxClass}
                    disabled={disabled}
                    checked={on}
                    onChange={(e) => onChange(`use${id}`, e.target.checked)}
                  />
                  Use a file
                </label>
              )}
              {on && (
                <input
                  id={htmlId}
                  type="file"
                  aria-label={f.label ?? id}
                  multiple={!!f.multiple}
                  disabled={disabled || up?.busy}
                  className="block text-sm"
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errorId : undefined}
                  onChange={(e) => e.target.files?.length && onFiles(id, Array.from(e.target.files))}
                />
              )}
              {on && up && <UploadStatus state={up} />}
              {errorText}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

export function UploadStatus({ state }: { state: UploadState }) {
  return (
    <p className={`text-sm ${state.error ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
      {state.error
        ? `${state.names}: ${state.error}`
        : state.busy
          ? `Uploading ${state.names}… ${state.percent}%`
          : `${state.names} uploaded`}
    </p>
  );
}
