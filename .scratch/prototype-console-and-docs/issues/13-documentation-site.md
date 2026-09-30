# 13: Documentation site carrying all of it

**What to build:** Everything the project knows is readable in one place, rendered as a site rather than as loose markdown: the authoritative control-plane spec, the R1–R69 requirements index, the ADRs including the ones the prototype itself forced, the domain glossary, the port map, and a runbook that takes a new operator from a clean clone to a running console and documentation site without tribal knowledge. The pages are generated from the repository's own markdown, so they cannot drift from the files they describe.

Serves R45, R57, R87, and the documentation obligations in `docs/specs/sovren-control-plane.md`.

**Blocked by:** 01 — Two runtimes, one workspace, one port registry.

**Status:** ready-for-agent

**Delivered.**

- [ ] The site renders the authoritative spec, the requirements index, the ADRs, the glossary, the port map, and the runbook, from the repository's own markdown — with no duplicated copy.
- [ ] Content is sourced by glob over the repository, so a new ADR or spec revision appears without editing a content list.
- [ ] A reader can search the documentation, and a missing page resolves to a useful not-found rather than a stack trace.
- [ ] The site is navigable by section — spec, requirements, decisions, glossary, runbook — rather than as one undifferentiated page list.
- [ ] Markdown renders the tables, code blocks, and internal links in the spec correctly, including the wide requirements table and the nomenclature table.
- [ ] The site runs as a container alongside the console on its own port from the registry.
- [ ] Every command in the runbook is an actual `make` target a new operator can paste.
- [ ] The port map is rendered from the port registry rather than restated in prose.

## Comments

Delivered. fumadocs 16.15 on Next 16, sourcing content by **glob over the repository's own markdown**, so ADR 0001 appeared on the site without a content list being edited. 27 of its own tests, including that every `make` target the runbook names exists and that the port map matches the registry.
