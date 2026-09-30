# 06: Three scopes, and Settings where the connections live

**What to build:** The operator works in Fleet when asking "is anything broken", in a Site when working inside one lab, and in Settings when wiring the integrations. The top bar switches scope and the entire sidebar changes with it, so the navigation always matches what is being worked on. Settings is where the three upstream connections live, and it makes the Proxmox requirement visible rather than surprising: Proxmox needs both an API token and a PAM SSH key, because its API cannot upload cloud-init snippets. Each integration has a connection test, so a misconfiguration is discovered before it is needed.

Serves R28, R37, R38, R60, R96–R100.

**Blocked by:** 05 — Fleet → Nodes list, the list archetype complete.

**Status:** ready-for-agent

- [ ] The top bar switches between Fleet, Site, and Settings; the sidebar changes completely with the scope and the current scope is reflected in the URL.
- [ ] Fleet answers "is anything broken" at a glance; a Site narrows to one physical lab, and nothing in the model presents a Site as a tenancy or security boundary.
- [ ] Settings holds the Proxmox, NetBird, and Dokploy connections, outside the fleet view.
- [ ] The Proxmox entry states that it needs both an API token and a PAM SSH key, and does not present itself as a single-credential integration.
- [ ] Each integration has a connection test that reports pass or fail with a sovren error code, runnable from the page.
- [ ] A stored credential is never rendered back in full; the console shows that it holds one, not what it is.
- [ ] Every scope has an empty state and an error state that is not a blank screen.
- [ ] Switching scope does not discard the operator's place in the scope they left.
