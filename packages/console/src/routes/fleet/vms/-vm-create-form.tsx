/**
 * Creating a VM: a form that is a page, and a Task on the other side.
 *
 * R39, R51, R44, and the screen is small because the archetype holds the parts.
 * What is here is the four decisions the archetype cannot make.
 *
 * ## 1. The form is a page, and it is the only thing on it
 *
 * It used to be a panel over the still-mounted list, which meant the list behind
 * it needed no help being remembered. As a page it is remembered by its address:
 * the list's own search is carried in on the way in (`-vm-paths.ts`) and pointed
 * back at on the way out, and the archetype renders that one address as both the
 * breadcrumb and Cancel so the two cannot drift apart.
 *
 * ## 2. The second column is the Node, and it is beside the field that chooses it
 *
 * The picker offers `name · cores · memory` and stops there, which is enough to
 * choose a machine and not enough to reason about one. So the Node the operator has
 * selected is rendered in full beside the form: its Site, its own CPU model, its
 * cores, its memory and its drives, how many guests it already hosts, and whether
 * it is on the overlay. **What it is not** is a normalisation: the Node's `cpuModel`
 * is the machine's, and the form says in as many words that a guest on it still
 * runs the fleet floor, because reporting the host's CPU as the guest's is the one
 * fiction this console cannot tell (R63).
 *
 * A column beside the form rather than a list of nodes under it, because the
 * operator's question is "what am I about to put on this machine", and a table of
 * every Node answers a different one. The Nodes are one dropdown away; the machine
 * they have chosen is the thing they are actually deciding about.
 *
 * ## 3. The submission is a request for work, not for a resource
 *
 * `VMCreate` answers **`202` with a `Task`**, because a boot takes about four
 * minutes and cannot finish inside a request. So the request goes out, the
 * response is narrowed on `202` (`readAcceptedTask`), and the operator is sent to
 * that Task's own route to watch it happen. The toast says `Creating <name>` and
 * carries the four facts that crossed the wire; it does not say the VM exists,
 * because the browser cannot know that yet (R44).
 *
 * **Nothing is inserted into the query cache.** A row added to the VMs list at
 * this point would be a VM the control plane has not created, on a list whose
 * whole job is to say what the control plane believes. The list is invalidated
 * instead, so the estate's own answer decides what appears and when -- and on an
 * estate that takes a moment to catch up, the honest answer is no row yet.
 *
 * ## 4. A refused request is a form that is still filled in
 *
 * A `400` from `VMCreate` carries `details`, and the mutator carries them through,
 * so each one lands on the control that caused it with the constraint named beside
 * it. The values in state are never cleared: an operator who typed eight fields
 * and got one of them wrong should be correcting one field, not retyping a form.
 * The page moves the focus to the first field the control plane named, which is
 * the one it considered most wrong.
 *
 * The `409` is a different case and is handled as a different case: a name the
 * estate already uses is `nameTaken` on `name`, and it is a refusal of one field
 * rather than of the request.
 *
 * ## What the units are
 *
 * Memory is asked for in MiB and disk in GiB, because an operator sizing a guest
 * is thinking in gibibytes and the control plane is not. The conversion is two
 * constants at the top of this file and the constraint that comes back is
 * `atLeast536870912` on `memoryBytes` either way -- the field is found by the
 * document's own field name, not by the unit the console happened to ask in.
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { getVMListQueryKey, useNodeList, useVMCreate, VMPurpose } from "@sovren/client";
import type { ErrorResponse, Node, VMCreateRequest } from "@sovren/client";

import { FormPage } from "@/components/sovren/form/form-page";
import { FormFailure } from "@/components/sovren/form/form-failure";
import { SelectField, TextField, problemFor } from "@/components/sovren/form/field";
import {
  acceptedToast,
  readAcceptedTask,
  refusedToast,
} from "@/components/sovren/form/accepted-task";
import { PropertiesTable } from "@/components/sovren/properties-table";
import { StateBadge } from "@/components/sovren/state-badge";
import { useToast } from "@/components/sovren/toast";
import { formatBytes, formatNumber } from "@/lib/format";
import { MAX_PAGE_SIZE } from "@/lib/list-state";
import { readList } from "@/lib/sovren";
import { useVmsListHref } from "./-vm-paths";

/** What the form asks for, in the operator's units. */
const MIB = 1024 * 1024;
const GIB = 1024 * 1024 * 1024;

/** The fields, as typed. Strings, because that is what a control holds. */
interface VmDraft {
  node: string;
  name: string;
  purpose: VMPurpose;
  cpuModel: string;
  cores: string;
  memoryMib: string;
  diskGib: string;
  tags: string;
}

/**
 * The empty form.
 *
 * `purpose` defaults to `workload` because that is what somebody opening a create
 * form by hand usually wants: a machine to work on. The two other values are
 * things an operator declares about sovren itself or about a Service they are
 * hosting, and a default that guessed either of those would be the console
 * inventing a fact about the estate.
 */
const EMPTY: VmDraft = {
  node: "",
  name: "",
  purpose: "workload",
  cpuModel: "",
  cores: "2",
  memoryMib: "2048",
  diskGib: "",
  tags: "",
};

/**
 * A number the operator typed, or `NaN`.
 *
 * `Number("")` is `0`, and `Number("abc")` is `NaN`; both are sent as written so
 * the control plane names the constraint rather than the console guessing which
 * of the two the operator meant. `Number.parseInt` because a memory field
 * accepts `4096` and not `4096 MiB`.
 */
const typed = (value: string): number => Number.parseInt(value, 10);

/** The request the document declares, assembled from the draft. */
const toRequest = (draft: VmDraft): VMCreateRequest => {
  const tags = draft.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
  return {
    node: draft.node,
    name: draft.name.trim(),
    purpose: draft.purpose,
    cores: typed(draft.cores),
    memoryBytes: typed(draft.memoryMib) * MIB,
    // Omitted rather than sent as an empty string: the document says the model
    // *defaults* to the fleet floor when it is absent, and an empty string is
    // not absent -- it is a model no estate offers, and the control plane would
    // (correctly) refuse it with `unsupportedCpuModel`.
    ...(draft.cpuModel.trim() === "" ? {} : { cpuModel: draft.cpuModel.trim() }),
    ...(draft.diskGib.trim() === "" ? {} : { diskBytes: typed(draft.diskGib) * GIB }),
    ...(tags.length === 0 ? {} : { tags }),
  };
};

/**
 * The Node the operator has chosen, in the machine's own words.
 *
 * Everything here is what `Node` carries and nothing is a fleet-wide default: a
 * 2009 Core 2 Duo and a 2019 Ryzen are both reported as themselves, because
 * heterogeneity is the normal case (R63) and a create form is where an operator
 * finds out what they are about to put a guest on.
 */
function NodeAside({ node }: { node: Node }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-sm font-medium">The Node this guest lands on</h2>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Whatever this machine's CPU reports, a guest on it runs the fleet floor, so the VM is
          never more capable than the weakest machine it might land on.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{node.name}</span>
        <StateBadge value={node.status} />
      </div>
      <PropertiesTable
        label="Node facts"
        columns={1}
        items={[
          { label: "Site", value: node.site.name },
          {
            label: "CPU model",
            value: <span className="font-mono text-[11px]">{node.cpuModel}</span>,
            hint: "The machine's own. A guest on it still runs the fleet floor.",
          },
          {
            label: "Cores",
            value:
              node.sockets === undefined
                ? formatNumber(node.cores)
                : `${formatNumber(node.cores)} across ${formatNumber(node.sockets)} sockets`,
          },
          {
            label: "Memory",
            value: `${formatBytes(node.memoryBytes)} of ${formatBytes(node.maxMemoryBytes)}`,
          },
          {
            label: "Drives",
            value:
              node.driveBytes === undefined || node.driveBytes === null
                ? `${formatNumber(node.driveCount)}, no capacity reported`
                : `${formatNumber(node.driveCount)} · ${formatBytes(node.driveBytes)}`,
            hint: "Drives are the Node's physical disks. A VM's own storage is a Disk, and is a field on this form.",
          },
          { label: "Guests on it", value: formatNumber(node.vmCount) },
          {
            label: "Overlay",
            value:
              node.overlay === null ? (
                <span className="text-amber-700 dark:text-amber-300">not enrolled</span>
              ) : (
                <span className="font-mono text-[11px]">{node.overlay.address}</span>
              ),
          },
        ]}
      />
    </>
  );
}

/**
 * The column before a Node has been chosen.
 *
 * A prompt rather than an empty box: the operator's question is "what am I about
 * to put on this machine", and a column that says so before they have answered
 * it is the reason to look at the column at all.
 */
function NodePrompt({ pending, available }: { pending: boolean; available: number }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-heading text-sm font-medium">The Node this guest lands on</h2>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {pending
          ? "Reading the Nodes in this estate."
          : `Choose a Node and this column says what it has. Every VM runs the fleet floor rather than its host's, so a guest is never more capable than the weakest machine it might land on. ${formatNumber(available)} ${available === 1 ? "Node is" : "Nodes are"} available.`}
      </p>
    </div>
  );
}

export function VmCreateForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useVMCreate();
  const listHref = useVmsListHref();

  const [draft, setDraft] = useState<VmDraft>(EMPTY);
  const [failure, setFailure] = useState<ErrorResponse | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  /**
   * The Nodes to create on, and the reason the field may be unusable.
   *
   * `useNodeList` is the generated hook, called with the document's own `size`
   * parameter and nothing else. It is read through `readList` because the client
   * never throws (R35), and a form that could not offer a Node has to say why
   * rather than present an empty picker as though the estate had none. The same
   * page of Nodes fills the picker and the column beside it, so the two cannot
   * disagree about what the estate holds.
   */
  const nodes = useNodeList({ size: MAX_PAGE_SIZE });
  const nodeRead = readList<Node>(nodes.data);
  const nodeRows = nodeRead.kind === "page" ? nodeRead.page.items : [];
  const nodeOptions = nodeRows.map((node) => ({
    value: node.name,
    label: `${node.name} · ${formatNumber(node.cores)} cores · ${formatBytes(node.memoryBytes)}`,
  }));
  const nodeFailure = nodeRead.kind === "error" ? nodeRead.error : undefined;
  const chosenNode = nodeRows.find((node) => node.name === draft.node);

  const set = <K extends keyof VmDraft>(key: K, value: VmDraft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const name = draft.name.trim();

  const submit = (): void => {
    if (busy) return;
    setBusy(true);
    // Cleared, so a second attempt does not show the first attempt's constraints
    // next to fields the operator has already changed.
    setFailure(undefined);

    create.mutate(
      { data: toRequest(draft) },
      {
        onSuccess: (response) => {
          setBusy(false);
          const read = readAcceptedTask(response);
          if (read.kind === "refused") {
            // Every arm other than 202 is a sovren error: a code, a requestId and
            // possibly the field-level details the fields above render in place.
            // The toast is the summary -- a page scrolled down to a field is not
            // the place to read a requestId from.
            setFailure(read.error);
            toast.report(refusedToast("create", name, read.error));
            return;
          }
          toast.report(acceptedToast("Creating", name, read.task));
          // The estate decides what a VM list shows, so the list is re-read rather
          // than written to. See the file's note on why nothing is inserted.
          void queryClient.invalidateQueries({ queryKey: getVMListQueryKey() });
          void navigate({ to: "/fleet/tasks/$task", params: { task: read.task.id } });
        },
        onError: (error: ErrorResponse) => {
          setBusy(false);
          setFailure(error);
          toast.report(refusedToast("create", name, error));
        },
      },
    );
  };

  return (
    <FormPage
      icon={HardDrive}
      title="Create VM"
      description="A guest on one Node. It is created from the fleet's CPU floor, arrives with the guest agent and the overlay client already on it, and reads as transitional until its create Task finishes."
      returnTo={{ label: "VMs", href: listHref }}
      onSubmit={submit}
      submit={{ label: "Create the VM", busy }}
      failure={failure}
      note="A create is accepted with a Task rather than a finished VM, because the boot takes about four minutes. Nothing here reports the VM as existing until that Task says so."
      aside={{
        label: "The Node this guest lands on",
        content:
          chosenNode === undefined ? (
            <NodePrompt pending={nodeRead.kind === "pending"} available={nodeRows.length} />
          ) : (
            <NodeAside node={chosenNode} />
          ),
      }}
    >
      {/*
        The Nodes could not be read, so the field that depends on them is
        unusable. Said once, above the field it disables: two copies of the same
        `requestId` on one page is a page with two things to read and one answer.
      */}
      {nodeFailure !== undefined && <FormFailure error={nodeFailure} />}

      <SelectField
        label="Node"
        required
        placeholder="Choose a Node"
        value={draft.node}
        onChange={(node) => {
          set("node", node);
        }}
        options={nodeOptions}
        disabled={nodeOptions.length === 0}
        hint="The physical machine this guest is created on, by name. Heterogeneity is normal: the console does not offer a Node it has not listed, and the column beside this form says what the one you picked actually has."
        {...(problemFor(failure, "node") === undefined
          ? {}
          : { problem: problemFor(failure, "node") })}
      />

      <TextField
        label="Name"
        required
        value={draft.name}
        onChange={(value) => {
          set("name", value);
        }}
        placeholder="web-07"
        hint="A DNS label, and the name it resolves by on the overlay. It is also the guest's hostname."
        {...(problemFor(failure, "name") === undefined
          ? {}
          : { problem: problemFor(failure, "name") })}
      />

      <SelectField
        label="Purpose"
        required
        placeholder="Choose a purpose"
        value={draft.purpose}
        onChange={(purpose) => {
          set("purpose", purpose);
        }}
        options={Object.values(VMPurpose).map((purpose) => ({ value: purpose, label: purpose }))}
        hint="A field rather than a separate resource: after creation the three are treated identically."
        {...(problemFor(failure, "purpose") === undefined
          ? {}
          : { problem: problemFor(failure, "purpose") })}
      />

      <TextField
        label="CPU model"
        value={draft.cpuModel}
        onChange={(value) => {
          set("cpuModel", value);
        }}
        placeholder="kvm64"
        hint="Leave empty for the fleet floor. A model this estate does not offer is refused by name rather than silently floored."
        {...(problemFor(failure, "cpuModel") === undefined
          ? {}
          : { problem: problemFor(failure, "cpuModel") })}
      />

      <TextField
        label="Cores"
        required
        type="number"
        value={draft.cores}
        onChange={(value) => {
          set("cores", value);
        }}
        {...(problemFor(failure, "cores") === undefined
          ? {}
          : { problem: problemFor(failure, "cores") })}
      />

      <TextField
        label="Memory"
        required
        type="number"
        unit="MiB"
        value={draft.memoryMib}
        onChange={(value) => {
          set("memoryMib", value);
        }}
        {...(problemFor(failure, "memoryBytes") === undefined
          ? {}
          : { problem: problemFor(failure, "memoryBytes") })}
      />

      <TextField
        label="Disk"
        type="number"
        unit="GiB"
        value={draft.diskGib}
        onChange={(value) => {
          set("diskGib", value);
        }}
        hint="Optional. A disk is VM storage; the physical disks on a Node are Drives and are never offered here."
        {...(problemFor(failure, "diskBytes") === undefined
          ? {}
          : { problem: problemFor(failure, "diskBytes") })}
      />

      <TextField
        label="Tags"
        value={draft.tags}
        onChange={(value) => {
          set("tags", value);
        }}
        placeholder="web, canary"
        hint="Comma separated. Optional."
        {...(problemFor(failure, "tags") === undefined
          ? {}
          : { problem: problemFor(failure, "tags") })}
      />
    </FormPage>
  );
}
