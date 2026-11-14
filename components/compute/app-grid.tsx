"use client";

import { useMemo, useState } from "react";
import { useAppInfo } from "@/hooks/use-cluster";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Search, PackageSearch } from "lucide-react";
import Link from "next/link";
import { AppIcon } from "./app-icon";

export function AppGrid() {
  const { data, isLoading, error } = useAppInfo();
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const apps: any[] = useMemo(() => data?.appsJson || [], [data]);
  const tags: string[] = data?.appTags || [];

  const byDomain = useMemo(() => {
    const q = search.toLowerCase();
    const groups: Record<string, any[]> = {};
    for (const app of apps) {
      const text = [app.name, app.appName, app.description, ...(app.tags || [])].filter(Boolean).join(" ").toLowerCase();
      if (q && !text.includes(q)) continue;
      if (selectedTag && !app.tags?.includes(selectedTag)) continue;
      (groups[app.appDomain] ||= []).push(app);
    }
    return groups;
  }, [apps, search, selectedTag]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Failed to load applications: {error.message}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search applications"
            placeholder="Search applications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={selectedTag === null ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedTag(null)}
            >
              All
            </Badge>
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTag === tag ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {Object.keys(byDomain).length === 0 ? (
        <EmptyState icon={PackageSearch} title="No applications found" description="Try another search, or ask an administrator to add the application." />
      ) : (
        Object.entries(byDomain).map(([domain, list]) => (
          <section key={domain} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{domain}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {list.map((app) => (
                <Link
                  key={`${app.appDomain}/${app.appName}`}
                  href={`/compute/${app.appDomain}/${app.appName}/${app.nobatch ? "remote" : "batch"}`}
                >
                  <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <AppIcon logo={app.logo} size={32} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{app.name || app.appName}</h4>
                          {app.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{app.description}</p>
                          )}
                          {app.remote && (
                            <Badge variant="secondary" className="mt-2 text-[10px] px-1 py-0">Remote desktop</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
