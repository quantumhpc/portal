"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, Plus, Pencil, Trash2, Loader2, RefreshCw, Shield, Search, ShieldOff, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { createUserSchema, updateUserSchema } from "@/lib/validation/user";
import { fetchJson } from "@/lib/fetch-json";

type AnyUser = any;


function useUsers() {
  return useQuery<AnyUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => fetchJson("/api/admin/users"),
  });
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive mt-1">{msg}</p> : null;
}

interface FormState {
  username: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  active: boolean;
}

function emptyForm(u?: AnyUser): FormState {
  return {
    username:    u?.username    ?? "",
    displayName: u?.displayName ?? "",
    email:       u?.email       ?? "",
    isAdmin:     !!u?.admin?.isAdmin,
    active:      u?.admin?.active ?? true,
  };
}

function UserFormDialog({
  user, open, onOpenChange,
}: {
  user: AnyUser | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const isEdit = !!user;
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm(user));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the form whenever the dialog opens/closes or targets another user.
  const resetKey = `${user?._id ?? ""}:${open}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setForm(emptyForm(user));
    setErrors({});
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = isEdit
        ? { displayName: form.displayName, email: form.email || undefined, isAdmin: form.isAdmin, active: form.active }
        : { username: form.username, displayName: form.displayName || undefined, email: form.email || undefined, isAdmin: form.isAdmin, active: form.active };

      const schema = isEdit ? updateUserSchema : createUserSchema;
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const e: Record<string, string> = {};
        for (const issue of parsed.error.issues) e[issue.path.join(".")] = issue.message;
        setErrors(e);
        throw new Error("Please fix the errors above");
      }
      setErrors({});
      if (isEdit) {
        return fetchJson(`/api/admin/users/${user._id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
      }
      return fetchJson(`/api/admin/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "User updated" : "User created");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit: ${user?.username}` : "Pre-authorise user"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? "Update display metadata or admin flags. Credentials are managed by the system (PAM)."
            : "Pre-authorise a system account. The user will log in with their OS credentials."}
        </p>
        <div className="space-y-4">
          {!isEdit && (
            <div>
              <Label htmlFor="username">System username</Label>
              <Input id="username" value={form.username} onChange={(e) => set("username", e.target.value)} />
              <FieldError msg={errors.username} />
            </div>
          )}
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />
            <FieldError msg={errors.displayName} />
          </div>
          <div>
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <FieldError msg={errors.email} />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isAdmin} onChange={(e) => set("isAdmin", e.target.checked)} />
              Admin
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              Active
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPage() {
  const { data, isLoading, refetch, isFetching } = useUsers();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | "admin" | "user">("all");
  const [active, setActive] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<AnyUser | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  const filtered = useMemo(() => {
    const src = Array.isArray(data) ? data : [];
    const q = search.toLowerCase();
    return src.filter((u: AnyUser) => {
      if (q) {
        const hay = [u.username, u.displayName, u.email]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (role === "admin" && !u.admin?.isAdmin) return false;
      if (role === "user"  &&  u.admin?.isAdmin) return false;
      if (active === "active"   && !u.admin?.active) return false;
      if (active === "inactive" &&  u.admin?.active) return false;
      return true;
    });
  }, [data, search, role, active]);

  const deactivate = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("User deactivated"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const hardDelete = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/admin/users/${id}?hard=1`, { method: "DELETE" }),
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    }),
    onSuccess: () => { toast.success("User reactivated"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo<ColumnDef<AnyUser>[]>(() => [
    {
      header: "Username",
      accessorKey: "username",
      cell: (info) => <span className="font-mono font-medium">{String(info.getValue() ?? "")}</span>,
    },
    {
      header: "Display name",
      accessorFn: (u) => u.displayName || u.username,
      id: "displayName",
    },
    {
      header: "Email",
      accessorFn: (u) => u.email || "",
      id: "email",
      cell: (info) => <span className="text-muted-foreground">{String(info.getValue() ?? "")}</span>,
    },
    {
      header: "Role", id: "role",
      accessorFn: (u) => (u.admin?.isAdmin ? "admin" : "user"),
      cell: (info) =>
        info.getValue() === "admin"
          ? <Badge className="text-xs"><Shield className="mr-1 h-3 w-3" /> Admin</Badge>
          : <Badge variant="secondary" className="text-xs">User</Badge>,
    },
    {
      header: "Status", id: "status",
      accessorFn: (u) => (u.admin?.active ? "active" : "inactive"),
      cell: (info) => info.getValue() === "active"
        ? <Badge variant="outline" className="text-xs">Active</Badge>
        : <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>,
    },
    {
      header: () => <span className="sr-only">Actions</span>, id: "actions",
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button aria-label="Edit user" variant="ghost" size="icon"
              onClick={() => { setEditing(u); setEditOpen(true); }}>
              <Pencil className="h-4 w-4" />
            </Button>
            {u.admin?.active ? (
              <Button aria-label="Deactivate user" variant="ghost" size="icon" onClick={() => {
                if (confirm(`Deactivate ${u.username}?`)) deactivate.mutate(u._id);
              }}>
                <ShieldOff className="h-4 w-4" />
              </Button>
            ) : (
              <Button aria-label="Reactivate user" variant="ghost" size="icon" onClick={() => reactivate.mutate(u._id)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button aria-label="Permanently delete user" variant="ghost" size="icon" onClick={() => {
              if (confirm(`Permanently delete ${u.username}? This cannot be undone.`)) hardDelete.mutate(u._id);
            }}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ], [deactivate, hardDelete, reactivate]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>User management</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh users">
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setCreating(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Pre-authorise
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                aria-label="Search users"
                placeholder="Search username, email…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter by role"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
            >
              <option value="all">All roles</option>
              <option value="admin">Admins</option>
              <option value="user">Users</option>
            </select>
            <select
              aria-label="Filter by status"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={active}
              onChange={(e) => setActive(e.target.value as any)}
            >
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No users match.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((g) => (
                    <TableRow key={g.id}>
                      {g.headers.map((h) => (
                        <TableHead key={h.id} className={h.id === "actions" ? "text-right" : ""}>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={cell.column.id === "actions" ? "text-right" : ""}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserFormDialog
        user={editing}
        open={editOpen || creating}
        onOpenChange={(b) => { setEditOpen(b); setCreating(b); if (!b) setEditing(null); }}
      />
    </div>
  );
}
