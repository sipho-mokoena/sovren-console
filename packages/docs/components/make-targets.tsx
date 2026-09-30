import { readMakeTargets } from "@/lib/makefile";

/**
 * Every target the repository's Makefile declares, read out of the Makefile.
 *
 * The runbook says "every command in here is a `make` target you can paste", and
 * a test holds it to that. This component is the other half: rather than a
 * hand-kept list in prose, it renders what the Makefile actually has.
 */
export function MakeTargets() {
  const targets = readMakeTargets();

  return (
    <div className="not-prose my-6 flex flex-wrap gap-2">
      {targets.map((target) => (
        <code
          key={target}
          className="bg-fd-muted text-fd-muted-foreground rounded-md px-2 py-1 text-xs"
        >
          make {target}
        </code>
      ))}
    </div>
  );
}
