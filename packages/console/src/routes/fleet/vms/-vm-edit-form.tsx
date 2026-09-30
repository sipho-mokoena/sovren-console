/**
 * Editing a VM: a page, and the two things a VM's page is allowed to do.
 *
 * ## The save is a refusal, and that is the honest screen
 *
 * **This screen does not save.** The console has no operation wired to a VM's
 * change, so the fields below are rendered **disabled** and the save is a
 * `DisabledActionButton` carrying the sovren code that refuses it (R43) -- the
 * same treatment every unavailable action in the console gets. A form whose
 * fields accept typing and then throw it away on Cancel would be a form that
 * lies twice: it invites an edit and then loses it.
 *
 * (The document has since grown `VMUpdate` on `PATCH /vms/{vm}`, answering `200`
 * with the VM or `202` with a Task, and the mock backend serves the `202` arm. A
 * save is a different ticket from this one: the screen below is about being a
 * page that can be left and returned to, and the refusal text is left as it was
 * rather than rewritten by a screen that is not wired to the operation. Recorded
 * here because the sentence on the button is a claim about the contract, and a
 * claim about the contract should be reviewed when the contract moves.)
 *
 * ## The delete is the destructive action, and it names the VM
 *
 * R53: a destructive action sits behind a confirmation that **names the
 * resource**, because "are you sure?" is answered by muscle memory and what is
 * being destroyed here is a machine somebody hand-built as a substrate step. The
 * name is the field the operator would recognise, not the id, and the
 * confirmation states that the teardown is a `Task` rather than a request -- so
 * the thing being confirmed is the *request for the teardown*, which is exactly
 * what will happen.
 *
 * `VMDelete` answers `202` with a `Task` like every other long action, so the
 * narrow is `readAcceptedTask` and the toast is `Deleting <name>`. The console
 * does not say the VM is gone, it does not remove the row, and it does not
 * navigate back to a list that would have to pretend the estate changed: the
 * operator goes to the Task, and the list is re-read so that the control plane's
 * own answer is what removes the row.
 *
 * ## What stands beside the fields is the resource
 *
 * A page has room the drawer did not, and the thing worth spending it on is the
 * VM itself: its identity block (R40 -- `id`, `created`, `updated`, the same
 * three in the same order as every detail page), its run state with whatever that
 * state is carrying, and the facts no field on this form shows -- its Site, its
 * overlay address, whether it is a template, and whether this estate could
 * migrate it at all. None of it is editable here, so showing it beside the fields
 * is not a second way to change something: it is the thing the fields are a
 * description *of*.
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { HardDrive, Trash2 } from "lucide-react";
import {
  getVMListQueryKey,
  getVMViewQueryKey,
  useVMDelete,
  useVMView,
  VMPurpose,
} from "@sovren/client";
import type { ErrorResponse, Vm } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/sovren/confirm-dialog";
import { DisabledActionButton } from "@/components/sovren/disabled-action";
import { ErrorState } from "@/components/sovren/error-state";
import { ListSkeleton } from "@/components/sovren/empty-state";
import { StateBadge } from "@/components/sovren/state-badge";
import { FormPage } from "@/components/sovren/form/form-page";
import { SelectField, TextField } from "@/components/sovren/form/field";
import {
  acceptedToast,
  readAcceptedTask,
  refusedToast,
} from "@/components/sovren/form/accepted-task";
import { IdentityBlock, PropertiesTable } from "@/components/sovren/properties-table";
import { useToast } from "@/components/sovren/toast";
import { derivedDisabledAction } from "@/lib/disabled-actions";
import { formatDuration, formatTimestamp } from "@/lib/format";
import { readOne } from "@/lib/sovren";
import { useVmsListHref } from "./-vm-paths";

/** Why the save is unavailable, in the console's own words. */
export const saveRefusal = (vm: Vm) =>
  derivedDisabledAction(
    "update",
    "action_not_permitted",
    `The contract declares no operation that updates a VM, so there is nowhere for ${vm.name} to be saved. A name is mutable in the model and no path exists to change it.`,
  );

export interface VmEditFormProps {
  /** A name or an id. Every path parameter in the contract accepts both (R32). */
  vm: string;
}

/**
 * A VM this page is for, as a page: the title is the VM's own name, and the way
 * out is the list the operator came from whether or not they came from one.
 */
const pageTitle = (vm: Vm): string => `Edit ${vm.name}`;

export function VmEditForm({ vm: ref }: VmEditFormProps) {
  const query = useVMView(ref);
  const read = readOne<Vm>(query.data);
  const listHref = useVmsListHref();

  /**
   * The three states, on the page rather than instead of it.
   *
   * A form reached by deep link to a VM nothing answers to is a form that cannot
   * be filled in, and its way out has to be the same way out as a form that can
   * -- so the failure is rendered *inside* the page rather than replacing it and
   * leaving nowhere to go.
   */
  if (read.kind === "pending") {
    return (
      <FormPage
        icon={HardDrive}
        title="Edit VM"
        returnTo={{ label: "VMs", href: listHref }}
        aside={{ label: "This VM", content: <ListSkeleton rows={4} columns={1} /> }}
      >
        <ListSkeleton rows={5} columns={1} />
      </FormPage>
    );
  }

  if (read.kind === "error") {
    return (
      <FormPage
        icon={HardDrive}
        title="Edit VM"
        description="The VM this page is for could not be read."
        returnTo={{ label: "VMs", href: listHref }}
      >
        <ErrorState
          error={read.error}
          compact
          onRetry={() => {
            void query.refetch();
          }}
          busy={query.isFetching}
        />
      </FormPage>
    );
  }

  return <VmEditBody vm={read.value} listHref={listHref} />;
}

function VmEditBody({ vm, listHref }: { vm: Vm; listHref: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useVMDelete();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const destroy = (): void => {
    if (busy) return;
    setBusy(true);
    remove.mutate(
      { vm: vm.name },
      {
        onSuccess: (response) => {
          setBusy(false);
          setConfirming(false);
          const read = readAcceptedTask(response);
          if (read.kind === "refused") {
            toast.report(refusedToast("delete", vm.name, read.error));
            return;
          }
          toast.report(acceptedToast("Deleting", vm.name, read.task));
          // Re-read rather than remove: the row leaves the list when the control
          // plane says it has, and not when this screen decides it should.
          void queryClient.invalidateQueries({ queryKey: getVMListQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getVMViewQueryKey(vm.name) });
          void navigate({ to: "/fleet/tasks/$task", params: { task: read.task.id } });
        },
        onError: (error: ErrorResponse) => {
          setBusy(false);
          setConfirming(false);
          toast.report(refusedToast("delete", vm.name, error));
        },
      },
    );
  };

  return (
    <>
      <FormPage
        icon={HardDrive}
        title={pageTitle(vm)}
        description={`On ${vm.node.name}, in ${vm.site.name}. The values below are what the control plane reports.`}
        returnTo={{ label: "VMs", href: listHref }}
        note="The console has no save wired to a VM's change, so the fields below are what the control plane reports rather than something this page can change. What it can do is destroy the VM, and that asks first."
        actions={
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 aria-hidden />
            Delete VM
          </Button>
        }
        aside={{ label: `About ${vm.name}`, content: <VmAside vm={vm} /> }}
      >
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <StateBadge value={vm.runState} />
          <span className="font-mono text-[11px] text-muted-foreground">{vm.id}</span>
        </div>

        <TextField label="Name" required value={vm.name} onChange={() => undefined} disabled />

        <TextField
          label="Node"
          required
          value={vm.node.name}
          onChange={() => undefined}
          disabled
          hint="The Node is chosen at creation. Moving a guest between machines is not an operation the contract declares."
        />

        <SelectField
          label="Purpose"
          required
          placeholder="—"
          value={vm.purpose}
          onChange={() => undefined}
          options={Object.values(VMPurpose).map((purpose) => ({ value: purpose, label: purpose }))}
          disabled
        />

        <TextField label="CPU model" value={vm.cpuModel} onChange={() => undefined} disabled />

        <TextField
          label="Cores"
          type="number"
          value={String(vm.cores)}
          onChange={() => undefined}
          disabled
        />

        <TextField
          label="Memory"
          type="number"
          unit="MiB"
          value={String(Math.round(vm.memoryBytes / (1024 * 1024)))}
          onChange={() => undefined}
          disabled
        />

        <TextField
          label="Disk"
          type="number"
          unit="GiB"
          value={
            vm.diskBytes === null || vm.diskBytes === undefined
              ? ""
              : String(Math.round(vm.diskBytes / (1024 * 1024 * 1024)))
          }
          onChange={() => undefined}
          disabled
        />

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium">Tags</span>
          <p className="font-mono text-[11px] text-muted-foreground">
            {vm.tags === undefined || vm.tags.length === 0 ? "none" : vm.tags.join(", ")}
          </p>
        </div>

        {/*
          R43. The save is rendered rather than removed, and it carries the sovren
          code -- so an operator learns that saving a VM is a thing the console
          was asked to do and cannot, rather than that the button was forgotten.
        */}
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <DisabledActionButton action="update" label="Save changes" refusal={saveRefusal(vm)} />
        </div>
      </FormPage>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this VM"
        subject={vm.name}
        body={
          <>
            This asks the control plane to tear the guest down, and answers with a Task rather than
            a finished deletion. The VM stays in the list until that Task says otherwise, and the
            task page is where you will be sent.
          </>
        }
        confirmLabel="Delete it"
        destructive
        busy={busy}
        onConfirm={destroy}
      />
    </>
  );
}

/**
 * The resource being edited, in the detail archetype's own vocabulary.
 *
 * `IdentityBlock` first and in the same order as every detail page (R40), then
 * the properties a form's fields have no room for. Every value is the control
 * plane's, and the two that are `| null` in the contract -- `overlay` and
 * `transitionalTask` -- are rendered as themselves rather than as an absent line,
 * because "not enrolled" and "no Task named" are facts and a blank cell is not.
 */
function VmAside({ vm }: { vm: Vm }) {
  return (
    <>
      <IdentityBlock
        id={vm.id}
        created={formatTimestamp(vm.created)}
        updated={formatTimestamp(vm.updated)}
      />

      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-sm font-medium">{vm.name}</h2>
        <p className="text-[11px] leading-snug text-muted-foreground">
          A guest on {vm.node.name}, in {vm.site.name}. Everything in this column is what the
          control plane reports about it, and none of it can be changed from this page.
        </p>
      </div>

      <PropertiesTable
        label={`${vm.name} facts`}
        columns={1}
        items={[
          {
            label: "Run state",
            value: <StateBadge value={vm.runState} />,
            hint:
              vm.runState === "transitional"
                ? vm.transitionalTask === null
                  ? "The contract reports a create Task in flight and names none."
                  : `A create Task is in flight: ${vm.transitionalTask.id}.`
                : vm.runState === "failed"
                  ? (vm.failureReason ?? "Failed, with no reason reported.")
                  : undefined,
          },
          {
            label: "Overlay",
            value:
              vm.overlay === null ? (
                <span className="text-amber-700 dark:text-amber-300">not enrolled</span>
              ) : (
                <span className="flex flex-col leading-tight">
                  <span className="font-mono text-[11px]">{vm.overlay.address}</span>
                  <span className="text-[11px] text-muted-foreground">{vm.overlay.hostname}</span>
                </span>
              ),
          },
          { label: "Site", value: vm.site.name },
          { label: "Uptime", value: formatDuration(vm.uptimeSeconds) },
          {
            label: "Migration",
            value: vm.canMigrate ? "the estate allows it" : "refused across this estate's CPUs",
            hint: "No operation that migrates a VM is declared, so none is offered either way.",
          },
          { label: "Template", value: vm.isTemplate === true ? "yes" : "no" },
        ]}
      />
    </>
  );
}
