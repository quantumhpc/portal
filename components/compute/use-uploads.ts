"use client";

import { useCallback, useState } from "react";
import { uploadFile } from "@/lib/client/upload";

export interface UploadState {
  names: string;
  percent: number;
  busy: boolean;
  paths?: string[];
  error?: string;
}

/** Per-field uploads: picking files uploads them right away and keeps the server paths. */
export function useUploads() {
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});

  const start = useCallback(async (id: string, files: File[]): Promise<string[] | null> => {
    const names = files.map((f) => f.name).join(", ");
    const set = (s: Partial<UploadState>) => setUploads((u) => ({ ...u, [id]: { ...u[id], ...s } as UploadState }));
    setUploads((u) => ({ ...u, [id]: { names, percent: 0, busy: true } }));
    try {
      const paths: string[] = [];
      for (const [i, file] of files.entries()) {
        paths.push(await uploadFile(file, (p) => set({ percent: Math.round((100 * i + p) / files.length) })));
      }
      set({ busy: false, percent: 100, paths });
      return paths;
    } catch (err) {
      set({ busy: false, error: (err as Error).message });
      return null;
    }
  }, []);

  const busy = Object.values(uploads).some((u) => u.busy);
  return { uploads, start, busy };
}
