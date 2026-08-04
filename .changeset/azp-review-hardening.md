---
'@appspine/auth': patch
---

Harden the `azp` authorized-party check added in 6.0.0: read the claim via
`hasOwnProperty` instead of plain property access (defense against prototype
pollution), and include the expected and received `azp` values in the
rejection log so a real cross-app token replay is distinguishable from a
local `OIDC_AUDIENCE` misconfiguration. No behavior change for valid or
already-rejected tokens — this only affects what gets logged and closes a
theoretical (currently unreachable) bypass path.
