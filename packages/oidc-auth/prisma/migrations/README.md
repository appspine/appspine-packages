# `@appspine/oidc-auth` — required additive migration

This package introduces one new table, `oidc_identities`. It is **required**, not optional, and it
is required by more Apps than it first appears:

`@appspine/auth`'s `AuthModule` composes `OidcAuthModule`, so an App that only upgrades
`@appspine/auth` — without knowingly adopting `@appspine/oidc-auth` — still reaches
`prisma.oidcIdentity.findUnique()` on **every** interactive login. Upgrading the package before
creating the table means every login fails. `./prisma/user.prisma` being byte-identical says
nothing about this: the new dependency is a new table, not a change to `users`.

051 拆解 §2.3 forbids *applying* a migration as part of installing or enabling a plugin. It does not
forbid producing one, and shipping the statement with the package is what lets an App owner review
and apply it deliberately.

## Rollout order

1. Apply the migration below. It is additive: no existing table is touched, so it is safe to run
   against a database still serving the previous release.
2. Deploy the new `@appspine/oidc-auth` / `@appspine/auth`.

Reversing that order breaks all interactive login for the window between the two steps.

## Statement

Prisma generates this from `../oidc-identity.prisma`; it is reproduced here so an operator can
review the exact effect without running the generator.

```sql
-- CreateTable
CREATE TABLE "oidc_identities" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "linked_from_legacy_email" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oidc_identities_issuer_subject_key" ON "oidc_identities"("issuer", "subject");

-- CreateIndex
CREATE INDEX "oidc_identities_user_id_idx" ON "oidc_identities"("user_id");
```

There is deliberately **no foreign key** on `user_id`. Declaring one would require
`@appspine/identity-core`'s `User` model to carry a back-relation field for an *optional* plugin,
which is the reverse dependency the 051 split removes. See `../oidc-identity.prisma` for the full
reasoning, and `IdentityStoreService`'s delete hook for how orphaned rows are prevented.

## Rollback

Dropping the table reverts the schema, but every mapping created since the deploy is lost: those
users fall back to the email-linking path on their next login, which re-creates the mapping only if
their IdP email still matches an active local account. Roll back the deployment first, then decide
whether the table needs to go at all — an unused `oidc_identities` is inert.

## Backfill

None. The table starts empty by design: `OidcIdentityService.resolve()` links each pre-existing
account on its owner's first login after the deploy, and records `linked_from_legacy_email = true`
so operators can watch that path drain before the email fallback is switched off (PL0-04 §4.1).
