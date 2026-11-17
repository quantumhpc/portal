"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";


/** Get tree nodes for a folder */
export function useFileTree(folder: string, nodeId: string | null) {
  return useQuery({
    queryKey: ["file-tree", folder, nodeId],
    queryFn: () => fetchJson(`/api/data/tree?folder=${folder}&id=${nodeId || "1"}`),
    enabled: !!nodeId,
    staleTime: 10 * 1000,
  });
}

/** Get file content */
export function useFileContent(resource: string | null) {
  return useQuery({
    queryKey: ["file-content", resource],
    queryFn: () => fetchJson(`/api/data/resource?resource=${encodeURIComponent(resource!)}`),
    enabled: !!resource,
  });
}

/** File operations mutation */
export function useFileOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { action: string; [key: string]: any }) => {
      const res = await fetch("/api/data/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Operation failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-tree"] });
    },
  });
}

/** Save file content */
export function useSaveFile() {
  return useMutation({
    mutationFn: async (params: { resource: string; content: string }) => {
      const res = await fetch("/api/data/resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }
      return res.json();
    },
  });
}
