# Domain Docs

Before exploring, read the root `CONTEXT.md` and relevant ADRs under `docs/adr/`. If they do not exist, proceed silently; domain-modeling skills create them lazily.

## Layout

This is a single-context repository:

- `CONTEXT.md` contains the domain glossary and context.
- `docs/adr/` contains architecture decision records.
- `src/` contains implementation code.

Use terminology defined in `CONTEXT.md`. If required terminology is absent, reconsider the wording or note the gap for domain modeling.

If proposed work conflicts with an existing ADR, surface that conflict explicitly instead of silently overriding the decision.
