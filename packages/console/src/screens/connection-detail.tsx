/**
 * A Connection, in detail.
 *
 * The Detail archetype (R38): breadcrumb, header, the identity block, and
 * properties. Two things on it are the reason it exists at all.
 *
 * **The requirements, with their own reasons.** Proxmox needs an API token *and*
 * a PAM SSH key, and the reason is that its API cannot upload cloud-init
 * snippets. That sentence is in the document, on the requirement, and this page
 * renders it rather than restating it -- so the explanation an operator reads is
 * the one the contract gives, and cannot drift from it.
 *
 * **The credentials, as facts rather than values.** `held`, `heldSince`,
 * `lastRotatedAt`. There is no field for the secret, and this page does not
 * pretend there is one: what it shows is that sovren holds a usable value, and
 * when that stopped being true of the last one. Rotation is the question an
 * operator actually has about a stored credential, and it is answerable without
 * the credential.
 */

import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useConnectionView } from "@sovren/client";
import type { Connection } from "@sovren/client";

import { ConnectionTestButton, KIND_PURPOSE, credentialNoun } from "@/screens/connections-list";
import { ErrorState } from "@/components/sovren/error-state";
import { ListSkeleton } from "@/components/sovren/empty-state";
import { HeldBadge, StateBadge } from "@/components/sovren/state-badge";
import { IdentityBlock, PropertiesTable } from "@/components/sovren/properties-table";
import { formatTimestamp } from "@/lib/format";
import { readOne } from "@/lib/sovren";

export interface ConnectionDetailProps {
  /** The ref from the path: a name or an id, both of which the contract accepts. */
  connection: string;
}

export function ConnectionDetail({ connection }: ConnectionDetailProps) {
  const query = useConnectionView(connection);
  const read = readOne<Connection>(query.data);

  if (read.kind === "pending") {
    return <ListSkeleton rows={6} columns={2} />;
  }

  if (read.kind === "error") {
    return (
      <ErrorState
        error={read.error}
        onRetry={() => {
          void query.refetch();
        }}
        busy={query.isFetching}
        actions={
          <Link to="/settings/connections" className="text-xs underline underline-offset-4">
            Back to the connections
          </Link>
        }
      />
    );
  }

  if (read.kind !== "value") return null;

  const item = read.value;
  const held = new Map(item.credentials.map((entry) => [entry.kind, entry]));

  return (
    <section aria-label={item.name} className="flex min-w-0 flex-col gap-3">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-[11px] text-muted-foreground"
      >
        <Link to="/settings/connections" className="hover:underline">
          Connections
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="font-mono text-foreground">{item.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-heading text-base leading-tight font-medium capitalize">
            {item.kind} integration
          </h1>
          <p className="text-xs text-muted-foreground">{item.name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <ConnectionTestButton connection={item} />
        </div>
      </header>

      <IdentityBlock
        id={item.id}
        created={formatTimestamp(item.created)}
        updated={formatTimestamp(item.updated)}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-xs font-medium">What it needs</h2>
          <p className="text-[11px] text-muted-foreground">
            Every credential this integration needs, whether or not sovren holds one, and why. An
            integration that needs two is not a misconfiguration — it is the integration.
          </p>
          <ul className="flex flex-col divide-y divide-border border border-border">
            {item.requirements.map((requirement) => {
              const credential = held.get(requirement.kind);
              return (
                <li key={requirement.kind} className="flex flex-col gap-1 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">
                      {credentialNoun(requirement.kind, requirement.label)}
                    </span>
                    <HeldBadge held={credential?.held ?? false} label="credential" />
                    {requirement.required ? (
                      <span className="font-mono text-[10px] text-muted-foreground">required</span>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">optional</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{requirement.why}</p>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-xs font-medium">What sovren holds</h2>
          <p className="text-[11px] text-muted-foreground">
            Whether a usable value is held, and when it last changed. The value itself crosses no
            operation in this contract, so there is nothing here to reveal.
          </p>
          <PropertiesTable
            label="Credentials held"
            items={item.credentials.map((credential) => ({
              label: credentialNoun(credential.kind, credential.label),
              value: <HeldBadge held={credential.held} label="credential" />,
              hint: `held since ${formatTimestamp(credential.heldSince ?? null)} · last rotated ${formatTimestamp(credential.lastRotatedAt ?? null)}`,
            }))}
            columns={1}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">Connection</h2>
        <PropertiesTable
          label="Connection properties"
          items={[
            { label: "Endpoint", value: item.endpoint, mono: true },
            { label: "For", value: KIND_PURPOSE[item.kind] ?? null },
            { label: "State", value: <StateBadge value={item.state} /> },
            {
              label: "Last test",
              value:
                item.lastTest === null ? (
                  "never tested"
                ) : (
                  <span className="flex w-fit flex-col items-start gap-1">
                    <StateBadge
                      value={item.lastTest.ok ? "tested" : (item.lastTest.code ?? "internal")}
                      label={item.lastTest.ok ? "pass" : (item.lastTest.code ?? "fail")}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {item.lastTest.message}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {item.lastTest.requestId} · {formatTimestamp(item.lastTest.testedAt)}
                      {item.lastTest.latencyMs === null
                        ? ""
                        : ` · ${String(item.lastTest.latencyMs)}ms`}
                    </span>
                  </span>
                ),
            },
          ]}
        />
      </div>
    </section>
  );
}
