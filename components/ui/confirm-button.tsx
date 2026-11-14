"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Destructive action behind a confirmation dialog.
 * `trigger` replaces the default button; `null` renders none, for a dialog opened
 * from elsewhere (a menu item) through `open` / `onOpenChange`.
 */
export function ConfirmButton({
  label, icon: Icon, confirmText, pending, onConfirm,
  trigger, open: openProp, onOpenChange, dismissLabel = "Cancel",
}: {
  label: string;
  icon: LucideIcon;
  confirmText: string;
  pending?: boolean;
  onConfirm: () => void;
  trigger?: ReactNode | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  dismissLabel?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm" className="text-destructive">
              <Icon className="mr-2 h-4 w-4" /> {label}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{confirmText}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{dismissLabel}</Button>
          <Button variant="destructive" disabled={pending} onClick={() => { onConfirm(); setOpen(false); }}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
