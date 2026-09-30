/**
 * The confirmation, which names the resource.
 *
 * R53: a destructive action sits behind a confirmation that names what it is
 * about to destroy, because "are you sure?" is answered by muscle memory and the
 * thing being destroyed is a physical machine. So the resource's name is
 * required here rather than optional -- there is no overload that renders a
 * generic prompt, and a caller with nothing to name has not built a destructive
 * action yet.
 */

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is about to happen, in the present tense. */
  title: string;
  /** The resource, named. Required: a confirmation that names nothing confirms nothing. */
  subject: string;
  /** What happens to it, and whether it can be undone. */
  body?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  subject,
  body,
  confirmLabel,
  onConfirm,
  destructive = false,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{subject}</span>
            {body !== undefined && <span className="mt-1 block">{body}</span>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
