---
"@appspine/frontend-shell": patch
---

Widen ShellLinkProps to accept all standard anchor props (via ComponentPropsWithRef<'a'>) instead of a hand-picked whitelist, so LinkComponent implementations can spread props through without manually re-declaring each one as new props are needed.
