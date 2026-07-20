---
"@appspine/frontend-shell": patch
---

`DialogContent` had no height cap, so dialogs whose content is taller than
the viewport (e.g. the Create API key dialog once it renders one checkbox
per non-`@internal` metadata-schema scope, three per model) extend both
above and below the viewport instead of scrolling internally — the footer
buttons become unreachable. Cap it at `max-h-[85vh]` with
`overflow-y-auto`, the standard shadcn dialog pattern for unbounded content.
