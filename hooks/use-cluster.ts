"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";


/** Cluster node list */
export function useNodeList() {
  return useQuery({
    queryKey: ["node-list"],
    queryFn: () => fetchJson("/api/manager/nodes?action=list"),
  });
}

/** Node info */
export function useNodeInfo(nodeName: string | null) {
  return useQuery({
    queryKey: ["node-info", nodeName],
    queryFn: () => fetchJson(`/api/manager/nodes?action=info&nodeName=${nodeName}`),
    enabled: !!nodeName,
  });
}

/** Queue list */
export function useQueueList() {
  return useQuery({
    queryKey: ["queue-list"],
    queryFn: () => fetchJson("/api/manager/queues"),
  });
}

/** App info (app list, config, etc.) */
export function useAppInfo() {
  return useQuery({
    queryKey: ["app-info"],
    queryFn: () => fetchJson("/api/info"),
    staleTime: 60 * 1000,
  });
}

/** Alerts */
export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchJson("/api/alerts?action=list"),
  });
}

/** License servers config */
export function useLicServers() {
  return useQuery({
    queryKey: ["lic-servers"],
    queryFn: () => fetchJson("/api/license?id=1"),
    staleTime: 60 * 1000,
  });
}

/** License pool for a specific feature */
export function useLicPool(feature: string | null) {
  return useQuery({
    queryKey: ["lic-pool", feature],
    queryFn: () => fetchJson(`/api/license?feature=${feature}`),
    enabled: !!feature,
  });
}
