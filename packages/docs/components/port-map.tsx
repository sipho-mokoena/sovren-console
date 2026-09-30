import { readPortRegistry } from "@/lib/ports";

/**
 * The port map, rendered from `config/ports.env`.
 *
 * There is no second copy of these numbers and no prose describing them: the
 * component reads the registry the Makefile and docker compose read, so the
 * table on this page is the registry, formatted.
 */
export function PortMap() {
  const registry = readPortRegistry();

  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b bg-fd-muted/30">
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="px-4 py-3 font-medium">Variable</th>
            <th className="px-4 py-3 font-medium">Port</th>
          </tr>
        </thead>
        <tbody>
          {registry.entries.map((entry) => (
            <tr key={entry.name} className="border-b last:border-b-0">
              <td className="px-4 py-3 align-top">
                <span className="font-medium">{entry.description || entry.name}</span>
              </td>
              <td className="px-4 py-3 align-top">
                <code className="text-fd-muted-foreground text-xs">{entry.name}</code>
              </td>
              <td className="px-4 py-3 align-top">
                <code>{entry.port}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-fd-muted-foreground border-t px-4 py-3 text-xs">
        Read from <code>{registry.entries[0]?.source ?? "config/ports.env"}</code> at build time.
        One rule: never write a port number anywhere else.
      </p>
    </div>
  );
}
