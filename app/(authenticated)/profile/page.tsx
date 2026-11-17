"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, User, Shield, Info } from "lucide-react";
import { toast } from "sonner";
import { fetchJson } from "@/lib/fetch-json";
import { PageHeader } from "@/components/ui/page-header";
import { UserRound } from "lucide-react";


export default function ProfilePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchJson("/api/profile"),
  });

  const user = data?.user;
  const usePam = data?.pam;

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  // Re-seed the form whenever a fresh profile is loaded.
  const [syncedUser, setSyncedUser] = useState<typeof user>(undefined);
  if (user && user !== syncedUser) {
    setSyncedUser(user);
    setDisplayName(user.displayName || user.username || "");
    setEmail(user.email || "");
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email: email || undefined }),
      }),
    onSuccess: (result) => {
      toast.success(result.message || "Profile updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const sys = user?.system;

  return (
    <div className="space-y-6">
      <PageHeader icon={UserRound} title="Profile" description="Your account on the cluster." />

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* Identity card */}
        <Card>
          <CardContent className="pt-6 flex flex-col items-center text-center gap-2">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-1">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">
              {user?.displayName || user?.username || "User"}
            </h3>
            {user?.email && (
              <p className="text-xs text-muted-foreground">{user.email}</p>
            )}
            {user?.admin?.isAdmin && (
              <Badge className="text-xs mt-1">
                <Shield className="mr-1 h-3 w-3" /> Administrator
              </Badge>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* System identity (read-only) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" /> System Identity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usePam && (
                <p className="text-xs text-muted-foreground mb-3">
                  This information is read from the system — it cannot be changed here.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Username</span>
                  <p className="font-mono font-medium">{sys?.username ?? user?.username}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">UID / GID</span>
                  <p className="font-mono">{sys?.uid ?? "—"} / {sys?.gid ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Home directory</span>
                  <p className="font-mono">{sys?.home ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Shell</span>
                  <p className="font-mono">{sys?.shell ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Editable display metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Display settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={user?.username}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <Separator />

              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
