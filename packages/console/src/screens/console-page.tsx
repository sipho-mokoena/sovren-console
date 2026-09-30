/**
 * The prototype page: what is faked, and how to make it fail on purpose.
 *
 * R56 is a requirement about the console, not only about the mock backend: a
 * failure path an operator cannot reproduce is a failure path nobody will ever
 * see. The sentinels are reachable from any list -- the picker is in the refresh
 * control on every one of them, and `d` cycles them -- but the *list* of what
 * each one does belongs somewhere an operator can read before they need it, and
 * this is that place.
 *
 * It is in Settings rather than in a hidden debug menu because the honest
 * statement about this build is that it has no control plane, and hiding that
 * behind a keyboard shortcut would make the console look more finished than it
 * is.
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SENTINEL_NAMES, SENTINEL_PARAM, sentinelHelp } from "@/lib/mock-backend";
import { CircleDot, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PropertiesTable } from "@/components/sovren/properties-table";
import { StateBadge } from "@/components/sovren/state-badge";

export function ConsolePage() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);

  const useSentinel = (name: string) => {
    void navigate({
      to: "/fleet/nodes",
      search: (previous: Record<string, unknown>) => ({ ...previous, [SENTINEL_PARAM]: name }),
    });
  };

  return (
    <section aria-label="Console" className="flex min-w-0 flex-col gap-3">
      <header className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 items-center justify-center border border-border bg-muted">
          <CircleDot className="size-4" aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-base leading-tight font-medium">Console</h1>
          <p className="text-xs text-muted-foreground">
            What this build is, and the switches that make it misbehave on purpose.
          </p>
        </div>
      </header>

      <div className="border border-border">
        <PropertiesTable
          label="What this prototype is"
          items={[
            {
              label: "The backend",
              value:
                "A mock, generated from sovren's own OpenAPI document and seeded from one estate description.",
            },
            {
              label: "Which estate",
              value:
                "Selected with ?estate= in the address bar. The default estate has more rows than fit on a page; compact has two Nodes.",
            },
            {
              label: "Which failure",
              value:
                "Selected with ?sentinel= in the address bar, or a ~name path segment. Every list's refresh control has the picker, and d cycles them.",
            },
            {
              label: "A typo in a sentinel",
              value:
                "is an invalid_request listing the names this build knows, so a mistyped reproduction never looks like the bug silently not happening.",
            },
            {
              label: "Not implemented",
              value:
                "The contract declares no writes for Nodes, Peers or Tasks. Every action on a resource that the document has no operation for is rendered disabled, with the sovren code that would refuse it.",
            },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xs font-medium">Sentinels</h2>
        <p className="text-[11px] text-muted-foreground">
          The names are the error codes, kebab-cased, so the URL says what will happen before it
          happens. Each one appends to any sovren URL.
        </p>
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: 280 }} />
            <col />
            <col style={{ width: 190 }} />
          </colgroup>
          <thead>
            <tr className="h-7">
              {["Query", "Yields", ""].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="border-b border-border bg-muted/60 px-2 text-left font-medium text-muted-foreground"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sentinelHelp.map((entry) => {
              const name = entry.query.replace(`?${SENTINEL_PARAM}=`, "");
              return (
                <tr key={name} className="h-8 border-b border-border last:border-b-0">
                  <td className="overflow-hidden px-2 font-mono text-[11px] whitespace-nowrap">
                    {entry.query}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Copy ${entry.query}`}
                      className="ml-1"
                      onClick={() => {
                        void navigator.clipboard?.writeText(entry.query).then(
                          () => {
                            setCopied(name);
                          },
                          () => {
                            setCopied(null);
                          },
                        );
                      }}
                    >
                      <Copy aria-hidden />
                    </Button>
                    {copied === name && <span role="status">Copied</span>}
                  </td>
                  <td className="overflow-hidden px-2 text-[11px] text-muted-foreground">
                    <StateBadge value={name} label={name} tone="neutral" />
                    <span className="ml-2">{entry.yields}</span>
                  </td>
                  <td className="px-2 text-right">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        useSentinel(name);
                      }}
                    >
                      See it on the Nodes list
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="font-mono text-[11px] text-muted-foreground">
          {SENTINEL_NAMES.length} sentinels · /api/v1/nodes~not-found works too
        </p>
      </div>

      <div className="flex max-w-md flex-col gap-1.5">
        <label htmlFor="sentinel-try" className="text-[11px] text-muted-foreground">
          Or type one, to see what an unknown name does
        </label>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("sentinel");
            if (typeof value === "string" && value !== "") useSentinel(value);
          }}
        >
          <Input name="sentinel" placeholder="not-a-sentinel" className="w-64 font-mono" />
          <Button type="submit" variant="outline" size="sm">
            Open the Nodes list
          </Button>
        </form>
      </div>
    </section>
  );
}
