/**
 * Settings → Connections: the three upstreams, and what sovren holds for them.
 *
 * Three things this screen has to get right, and each is a requirement rather
 * than a preference.
 *
 * **Proxmox is two credentials, and the page says so.** R60: its API cannot
 * upload cloud-init snippets -- they need SFTP and a PAM account -- so sovren
 * holds an API token *and* a PAM user's SSH key. That is a property of Proxmox
 * rather than a design preference, and it is read out of `requirements[]` with
 * each requirement's own `why`, so the page cannot drift from the contract. An
 * integration that presented itself as one-credential would be a surprise
 * discovered at the moment of the first machine.
 *
 * **A stored credential is never rendered back.** `Connection.credentials[]`
 * carries `held` and nothing else -- there is no field for the secret, and
 * adding one would make the document a place a credential could be read out of.
 * So the page says which credential is held, and since when, and never what it
 * is.
 *
 * **The connection test is a 200.** It ran; that is what the status reports. The
 * answer is `ok: false` with a sovren `code` and a `requestId` that is also in
 * the audit trail, so an operator who reports "the Dokploy test failed" can be
 * traced to the exact request. A test that returned an HTTP error would be
 * reporting its own success wrongly, and the console would have two places to
 * look for the answer.
 */

import { useState } from "react";
import { Cable, Eye, PlugZap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getConnectionListQueryKey, useConnectionList, useConnectionTest } from "@sovren/client";
import type { Connection, ConnectionTestResult } from "@sovren/client";

import { Button } from "@/components/ui/button";
import { ListPage } from "@/components/sovren/list-page";
import type { ListColumn } from "@/components/sovren/list-page";
import { LinkButton } from "@/components/sovren/link-button";
import { HeldBadge, StateBadge } from "@/components/sovren/state-badge";
import { useToast } from "@/components/sovren/toast";
import { formatTimestamp } from "@/lib/format";
import { useListState } from "@/lib/list-state";
import { readOne } from "@/lib/sovren";

const OWNED = ["size", "page", "sort"] as const;
const SORTABLE = ["name", "kind", "state"] as const;

/**
 * What a credential requirement is called, in the console's own words.
 *
 * Read from the requirement's `label` where there is one -- the contract supplies
 * "API token" and "PAM SSH key" for Proxmox, in Proxmox's own terms -- and this
 * table is only the fallback for a kind the document has not labelled.
 */
const CREDENTIAL_NOUN: Record<string, string> = {
  api_token: "API token",
  api_key: "API key",
  pam_ssh_key: "PAM SSH key",
  password: "Password",
  tls_ca_bundle: "TLS CA bundle",
};

export const credentialNoun = (kind: string, label?: string): string =>
  label ?? CREDENTIAL_NOUN[kind] ?? kind;

/** The kind, spelled the upstream's way rather than a sovren synonym. */
const KIND_NOUN: Record<string, string> = {
  proxmox: "Proxmox",
  netbird: "NetBird",
  dokploy: "Dokploy",
};

/**
 * What the integration is for, in one clause. Upstream nouns, not renamed.
 *
 * On the detail page rather than in the table: a list this dense has no room for
 * a sentence per row, and a column of sentences is a column nobody reads.
 */
export const KIND_PURPOSE: Record<string, string> = {
  proxmox: "the substrate: the machines, and the API token that reads them",
  netbird: "the overlay network, and the internal names it resolves",
  dokploy: "the workloads, and the services deployed on them",
};

/**
 * The credential cell.
 *
 * Every requirement is rendered, held or not, and the requirement's own label is
 * what is shown. So a Proxmox row reads as two credentials rather than one
 * because the *contract* says two, and if the contract ever changed, this cell
 * would change with it.
 */
function CredentialsCell({ connection }: { connection: Connection }) {
  const held = new Map(connection.credentials.map((entry) => [entry.kind, entry]));
  return (
    <span className="flex flex-col items-start gap-0.5">
      {connection.requirements.map((requirement) => {
        const entry = held.get(requirement.kind);
        return (
          <span key={requirement.kind} className="flex items-center gap-1">
            <HeldBadge
              held={entry?.held ?? false}
              label={`${credentialNoun(requirement.kind, requirement.label)}${requirement.required ? "" : " (optional)"}`}
            />
            {entry?.held === true && entry.heldSince != null && (
              <span className="text-[10px] text-muted-foreground">
                since {formatTimestamp(entry.heldSince)}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function LastTestCell({ connection }: { connection: Connection }) {
  if (connection.lastTest === null) {
    return <span className="text-muted-foreground">never tested</span>;
  }
  const test = connection.lastTest;
  return (
    <span className="flex flex-col items-start leading-tight">
      <StateBadge
        value={test.ok ? "tested" : (test.code ?? "internal")}
        label={test.ok ? "pass" : (test.code ?? "fail")}
      />
      <span className="text-[10px] text-muted-foreground">{formatTimestamp(test.testedAt)}</span>
    </span>
  );
}

/**
 * The column set, in the order an operator reads it.
 *
 * Credentials come second, before the endpoint, because the question this page
 * exists to answer is "what has sovren been told, and does it answer" -- and
 * because a page whose most important column is only visible after a horizontal
 * scroll has answered it for nobody.
 */
export const connectionColumns = (): readonly ListColumn<Connection>[] => [
  {
    key: "name",
    header: "Integration",
    width: 220,
    identity: true,
    sortable: true,
    sortValue: (connection) => connection.name,
    render: (connection) => (
      <span className="flex flex-col leading-tight">
        <span>{KIND_NOUN[connection.kind] ?? connection.kind}</span>
        <span className="truncate text-[11px] font-normal text-muted-foreground">
          {connection.name}
        </span>
      </span>
    ),
  },
  {
    key: "credentials",
    header: "Credentials held",
    width: 400,
    render: (connection) => <CredentialsCell connection={connection} />,
  },
  {
    key: "endpoint",
    header: "Endpoint",
    width: 280,
    render: (connection) =>
      connection.endpoint === null ? (
        <span data-endpoint="unset" className="text-[11px] text-amber-700 dark:text-amber-300">
          not configured
        </span>
      ) : (
        <span className="font-mono text-[11px]">{connection.endpoint}</span>
      ),
  },
  {
    key: "state",
    header: "State",
    width: 130,
    sortable: true,
    sortValue: (connection) => connection.state,
    render: (connection) => <StateBadge value={connection.state} />,
  },
  {
    key: "lastTest",
    header: "Last test",
    width: 160,
    render: (connection) => <LastTestCell connection={connection} />,
  },
];

/**
 * The connection test, as a control.
 *
 * The toast is written from the *result* and nothing else. A pass says the
 * integration answered, with the latency that was measured. A failure says which
 * code came back and the `requestId` that traces it. Neither says the connection
 * "is working", because the console has observed one exchange and not a
 * continuing state (R44).
 */
export function ConnectionTestButton({ connection }: { connection: Connection }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const test = useConnectionTest();
  const [name, setName] = useState<string | null>(null);

  const onClick = () => {
    setName(connection.name);
    test.mutate(
      { connection: connection.name },
      {
        onSuccess: (response) => {
          const read = readOne<ConnectionTestResult>(response);
          if (read.kind === "error") {
            toast.report({
              tone: "error",
              title: `The test for ${connection.name} did not run`,
              detail: `${read.error.code} · ${read.error.requestId}`,
            });
            return;
          }
          if (read.kind !== "value") return;
          const result = read.value;
          if (result.ok) {
            toast.report({
              tone: "ok",
              title: `${connection.name} answers`,
              detail:
                result.latencyMs === null
                  ? result.requestId
                  : `${String(result.latencyMs)}ms · ${result.requestId}`,
            });
          } else {
            toast.report({
              tone: "error",
              title: `${connection.name} does not answer`,
              detail: `${result.code ?? "no code"} · ${result.requestId}`,
            });
          }
        },
        onSettled: () => {
          // A real control plane records the test on the Connection, so the list
          // and the detail page are invalidated to show it. The mock's estate is
          // a description of what exists and does not mutate, so nothing moves
          // here -- which is itself the honest answer: the toast reported what
          // was observed, and the estate still says what it said.
          void queryClient.invalidateQueries({ queryKey: getConnectionListQueryKey() });
        },
        onError: () => {
          // The client never throws, so this is unreachable in practice. It is
          // here so that if that ever stops being true, the console says so
          // rather than appearing to have run a test that did not.
          toast.report({ tone: "error", title: `The test for ${connection.name} did not run` });
        },
      },
    );
  };

  return (
    <>
      <Button
        variant="outline"
        size="xs"
        onClick={onClick}
        disabled={test.isPending && name === connection.name}
      >
        <PlugZap aria-hidden />
        Test connection
      </Button>
      <LinkButton
        variant="ghost"
        to="/settings/connections/$connection"
        params={{ connection: connection.name }}
      >
        <Eye aria-hidden />
        Details
      </LinkButton>
    </>
  );
}

export function ConnectionsList() {
  const list = useListState({ key: "settings/connections", owned: OWNED, sortable: SORTABLE });
  const query = useConnectionList({
    size: list.size,
    ...(list.token === null ? {} : { page: list.token }),
  });

  return (
    <ListPage<Connection>
      title="Connections"
      icon={Cable}
      query={query}
      list={list}
      columns={connectionColumns()}
      rowKey={(connection) => connection.id}
      rowHref={(connection) => `/settings/connections/${connection.name}`}
      // Wide enough for the test control and the link beside it.
      actionsWidth={240}
      rowActions={(connection) => <ConnectionTestButton connection={connection} />}
      create={
        <span className="font-mono text-[11px] text-muted-foreground">
          credentials are written by the control plane, never by the console
        </span>
      }
      empty={{
        title: "No integration is configured",
        body: "There are exactly three of them — Proxmox, NetBird and Dokploy — so an empty list means the control plane has been asked for none.",
      }}
    />
  );
}
