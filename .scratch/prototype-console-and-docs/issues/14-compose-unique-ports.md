# 14: Compose, with every port named once

**What to build:** The whole prototype runs as containers on named, non-default ports, so a second checkout on the same machine does not collide and nothing depends on a developer's local Postgres. One command brings the estate up with health checks, one tears it down, and the port assignments come from the registry in ticket 01 rather than being restated in the compose file.

Serves R59, R68, and the compose requirement in the prototype brief.

**Blocked by:** 05 — Fleet → Nodes list, the list archetype complete. 13 — Documentation site carrying all of it.

**Status:** ready-for-agent

- [ ] `make up` starts the database, the console, and the documentation site; `make down` removes them; both are safe to run repeatedly.
- [ ] Every published port is unique and non-default, and each is read from the port registry rather than restated in the compose file.
- [ ] The database has a health check, and the console and documentation site wait for it rather than racing it.
- [ ] The repository is mounted into the app containers so edits hot-reload, and no container writes to the host outside an explicit volume.
- [ ] Logs from every service are reachable with one command, prefixed by service name.
- [ ] Tearing down and bringing back up preserves the database volume unless reset is asked for explicitly.
- [ ] A second checkout on the same machine starts on a different port block without editing any file.
- [ ] The compose file is documented in the runbook, including what each service is and why it is there.
