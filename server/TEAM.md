# Team — Staff and Manager workspaces

The server side of the design's **Counter · Who's on shift**, **Counter · Home**,
**Counter · All customers**, **Manager · …** and **Switch workspace** screens.
Code: `domain/team.ts` (rules), `http/routes/team.ts` (routes), plus narrow
changes in `domain/gate.ts`, `http/routes/gate.ts`, `http/routes/partner.ts`,
`http/server.ts`, `domain/dashboard.ts` and `domain/consent.ts`.
Checked by the `Staff and Manager workspaces` section of `verify.ts`.

The one rule holds here too: **the server decides, the client displays.** No
role, permission, venue or attribution the phone sends is believed; each is
read from `team_members` on every request.

---

## Roles

| role        | who                                     | counter permissions                  |
|-------------|-----------------------------------------|--------------------------------------|
| owner       | `venues.owner_user_id` — not a team row | all, always                          |
| `manager`   | a team row                              | all, by role (bits ignored)          |
| `shiftlead` | a team row                              | template: all six on                 |
| `cashier`   | a team row                              | template: earn, redeem, scan, running|
| `custom`    | a team row                              | template: none — the owner picks     |

A template is where the add-staff sheet starts; the owner may toggle any bit
afterwards and the role label stays. An admin (`user_roles.admin`) is treated
like the owner everywhere below.

### The six permissions

| key       | design label               | what it gates on the server |
|-----------|----------------------------|-----------------------------|
| `earn`    | Confirm earning            | entering the bill and confirming an `earn` transaction; `POST …/counter` |
| `redeem`  | Confirm redemptions        | entering the bill and confirming `voucher_redeem` / `reward_redeem`; scanning a customer's pass, `POST /v1/gate/passes/scan` (FLUTTER-BRIEF §3b) |
| `scan`    | Scan / show codes          | `POST /v1/venues/:id/qr`, `POST /v1/gate/manual`, `POST …/counter/lookup` |
| `running` | See what's running         | `running` in `GET /v1/team/:venueId/counter` (empty without it) |
| `count`   | See customer count         | `customersToday` and `recent` in the counter view (null / empty without it) |
| `pause`   | Pause / resume campaigns   | `POST /v1/team/:venueId/running/:id/pause` |

Reading the confirmation queue (`GET /v1/venues/:id/pending`) needs `earn` or
`redeem`; reading one transaction or cancelling a pending one needs any of
`earn`/`redeem`/`scan`.

### Permission matrix — management

| action                                              | owner / admin | manager | staff |
|-----------------------------------------------------|:---:|:---:|:---:|
| Partner dashboard (`auth: 'partner'` routes via `mine()`: today, overview, analytics, deals, stamp cards, tiers, budget read, top-up, rebalance, pushes, customers, scans, listing, assistant, audit) | ✓ | ✓ own venue only | ✗ |
| Team: list                                          | ✓ | ✓ | ✗ |
| Team: add / edit / revoke / re-issue code — cashier, shift lead, custom | ✓ | ✓ | ✗ |
| Team: add a manager, promote to manager, edit or revoke a manager (incl. self) | ✓ | ✗ | ✗ |
| Billing: `POST /v1/billing/checkout`, `/cancel`, `GET …/subscription` | ✓ | ✗ (checks `owner_user_id`) | ✗ |
| Create a venue (`POST /v1/partner/venues`)          | ✓ (needs `partner_owner`) | ✗ | ✗ |
| Venue deletion, ownership transfer, payouts         | no such partner routes exist today; any added must use `team.requireOwner` | ✗ | ✗ |

The design's manager screen says "You can pause, resume, top up and extend
here", so budget top-up and rebalance are open to managers. `PATCH` of the
venue's own settings and `PUT …/budget` are also reachable by a manager today
because the contract lists only billing/payouts/subscription/deletion/transfer
as owner-only — tighten with `team.requireOwner` in the route if that changes.

---

## Routes

All camelCase JSON. All are `auth: 'user'`; the venue question is answered in
the handler.

### The owner's team sheet (owner, admin, or this venue's manager)

```
GET    /v1/partner/venues/:venueId/team                     → { members: [Member] }
POST   /v1/partner/venues/:venueId/team  {name, role, perms?} → { member: Member, code: "NNNNNN" }
PATCH  /v1/partner/venues/:venueId/team/:memberId {role?, perms?} → { member }
DELETE /v1/partner/venues/:venueId/team/:memberId           → 204
POST   /v1/partner/venues/:venueId/team/:memberId/code      → { code }
```

`Member = { id, name, role, perms, status: "invited"|"active"|"revoked", joinedAt, lastSeenAt, onShift, codeExpiresAt }`

- `codeExpiresAt` is **additive to the wire contract**: when the outstanding
  code stops working, or null. The code itself is never in a `Member`.
- `perms` may be partial; missing keys keep the base (the role's template on
  create or on a role change, the member's current bits otherwise). An unknown
  key or a non-boolean is a 400 — silently dropping `refund: true` would let a
  client believe it granted something.
- The list omits revoked members.
- A member id belonging to another venue is **404**, not 403.
- At most 50 non-revoked members per venue (`cap_reached`, 409).
- Re-issuing a code for an **active** member ("new phone") keeps the old
  account linked until the new code is redeemed, then moves the membership to
  the account that redeemed it.

### Joining and the switcher (any signed-in, non-guest account)

```
POST /v1/team/join {code}  → { workspace: Workspace }
GET  /v1/me/workspaces     → { workspaces: [Workspace] }
```

`Workspace = { kind: "personal"|"owner"|"manager"|"staff", venueId, venueName, memberId, role, perms }`

Personal is always first, then owned venues (`role: "owner"`, all perms), then
active memberships (managers first). A revoked membership is simply absent.

Join errors: `404 not_found` for wrong / expired / used / revoked / malformed —
one message for all; `429 rate_limited` with `retryAfterMinutes` after five
failures; `403 forbidden` for a guest; `409 conflict` for the venue's owner
typing their own staff's code, or somebody already on that team (neither costs
an attempt).

### The counter (anybody on this venue's counter)

```
GET  /v1/team/:venueId/counter[?memberId=]         → { venue:{id,name}, member, perms, running, customersToday, recent }
POST /v1/team/:venueId/shift {action:"start"|"end", memberId?} → { member }
POST /v1/team/:venueId/running/:id/pause {paused}  → { item }
```

- `running`: `[{ id, kind: "deal"|"stampCard"|"voucherTier", name, sub, paused, canPause }]`
  — live/paused deals whose window has not closed, active/paused stamp cards,
  every voucher rung. `name`/`sub` are English display strings.
- `recent`: today's (venue-local) committed transactions, newest first, up to 50:
  `{ initials, name, detail, time }` where `time` is the ISO confirm instant.
  `name` is first name + last initial **and only when the customer shares with
  this venue** (the till log's §1.4 rule); otherwise `"Customer"` / `"?"`.
- `?memberId=` (owner/manager only) shows the counter exactly as that member
  would see it — the "Who's on shift?" device. A staff login naming anybody
  else is 403.
- Shift: a staff login may start/end only its own (`memberId` absent or its
  own). The owner's device must name the member (400 otherwise); a manager's
  defaults to themselves. Only `active` members can be on shift.
- Pause runs through the owner's own functions (`deals.setStatus` with the
  publishability guard, `partners.setCampaignStatus` with the plan allowance,
  `voucher_tiers.active` for a rung), so a shift lead resuming a deal passes
  exactly the gates the owner would.

### The gate, changed

| route | before | now |
|---|---|---|
| `POST /v1/venues/:id/qr` | partner, owner | user, `scan` at this venue |
| `POST /v1/gate/manual` | partner | user, `scan` (checked in `openTransaction`) |
| `POST /v1/gate/passes/scan` `{venueId, token\|code, memberId?}` | — (new) | user, `redeem` at `venueId`; the pass must be for that venue |
| `POST /v1/gate/transactions/:id/amount` | owner | `earn`/`redeem` by intent |
| `POST /v1/gate/transactions/:id/confirm` `{memberId?}` | partner, owner | user, `earn`/`redeem` by intent; records the member |
| `POST /v1/gate/transactions/:id/cancel` | owner | any counter permission |
| `GET /v1/gate/transactions/:id` | owner | any counter permission; adds `confirmedBy` |
| `GET /v1/venues/:id/pending` | partner, owner | user, `earn` or `redeem` |
| `POST /v1/partner/venues/:id/counter/lookup` | partner, owner | user, `scan`; staff see a shortened name |
| `POST /v1/partner/venues/:id/counter` `{…, memberId?}` | partner, owner | user, `earn` or `redeem` (then the gate's own checks) |

Attribution: `transactions.confirmed_member_id`. A staff login's confirmations
are its own. The owner's (or a manager's) shared device may pass `memberId`,
which must be an **active member of this venue holding the permission** or the
confirm is refused. A manager confirming without `memberId` is recorded as
themselves; the owner without `memberId` as NULL (the owner). The receipt,
`GET /v1/gate/transactions/:id` and the till log (`GET …/scans` rows) carry
`confirmedBy` (`{memberId, name}` on the first two, the name on the till log).

---

## Security decisions

1. **The global `manager` role is dead.** `gate.requireStaff` used to accept
   `user_roles.role = 'manager'` at *every* venue. Nobody held it, so nothing was
   exposed, but the first grant would have been a skeleton key. Managers are
   venue-scoped rows now; `requireStaff` delegates to `team.requireManage`, and
   `http/server.ts` admits a caller to `auth: 'partner'` routes if they own a
   venue, are an admin, or **actively manage** a non-deleted venue — the
   per-venue check is still `mine()` in each handler. Verified: a user holding
   the old global role is refused.
2. **Join codes** — 6 digits from `crypto.randomInt`, stored only as
   `HMAC-SHA256(key = "team-join:" + PAYLEZ_SECRET, code)` (a bare hash of a
   six-digit number is reversed by a loop), `UNIQUE` so collisions are redrawn,
   compared with `timingSafeEqual` after the keyed index lookup, **single use**
   (the hash is cleared by the same conditional `UPDATE … WHERE code_hash = $h`
   that activates the row, so two phones racing one code link one account),
   **7-day expiry**, invalidated by re-issue and revocation, and returned in the
   clear exactly once.
3. **Brute force** — failures only are counted, in `auth_attempts` (`ok = 0`),
   under two subjects: the account and the connection (the daily-rotating HMAC
   of the client address from `limits.connectionKey` — the address only; the
   user-agent was once hashed in too, which let a caller get a fresh bucket by
   changing the header). Five failures in a rolling
   hour on **either** blocks the next attempt *before the code is examined*, so
   a right guess on the sixth try is still refused. This is in the domain and
   always on (the suite's `limits: false` does not disable it). The attempt is
   *booked as a failure before the code is looked at* and forgiven afterwards
   if it was not a miss, so a parallel burst on Postgres cannot slip more than
   five past the count. The route also carries an ordinary 30/hour per-account
   call limit.
   - Residual risk, stated: a million-code space with many live invitations
     and many throwaway accounts is still attackable at 5 guesses/account/hour;
     sign-up is itself rate-limited per connection, codes live 7 days, and a
     join is visible to the owner (member turns `active` with `joinedAt`).
   - **The client address** (`limits.clientAddress`): `X-Forwarded-For` is
     believed only from a loopback peer — the nginx on the same box that
     DEPLOY.md describes — and only its **last** entry, the one nginx's
     `$proxy_add_x_forwarded_for` appends. It used to read the first entry,
     which the caller writes. ⚠️ This is right only if the production nginx
     sets `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (or
     `$remote_addr`). If it sets neither, the client's header passes straight
     through and the last entry is theirs again — check
     `/etc/nginx/sites-enabled/paylez` once.
4. **Revocation is immediate.** Nothing about team access is cached in the
   session or the actor; `team.accessTo` reads the row on every request, and
   `gate.confirm` reads it *inside the commit's transaction*. A revoked member's
   next QR, confirm, counter read or attribution is 403 and their workspace is
   gone from `/v1/me/workspaces`.
5. **Every route authorises by venue.** Another venue's owner gets 403 on this
   venue's team; a member id reached through the wrong venue's path is 404; a
   staff login sees only its own venue's counter; a manager's dashboard access
   is only their venue.
6. **Managers cannot escalate.** They cannot create, promote to, edit, revoke or
   re-issue codes for a manager (themselves included), and never touch the
   owner, who is not a row.
7. **No self-service at the till.** A team member cannot confirm a transaction
   whose customer is their own account, and an owner's device cannot attribute
   a confirmation to the member who is the customer.
8. **Data minimisation (GDPR).** Customer names reaching a staff login — the
   counter's `recent` and the counter lookup card — are first name + last
   initial, and only where the customer shares with the venue at all. Owners
   and managers keep what they saw before.
9. **Export and erasure.** `consent.exportUser` includes the account's
   memberships (`team`); `consent.eraseUser` revokes them, clears any code, ends
   the shift and replaces the owner-typed name with "Former team member". Rows
   are kept because transactions reference them.
10. **Audit.** Invite, update, revoke, code re-issue, join and staff pauses are
    written to `audit_log` with the actor's role at the venue; confirmations
    record `memberId` in the `gate.confirm` audit entry.

## Storage

`team_members` (table 92): permission bits as six CHECKed integer columns,
`code_hash UNIQUE`, `status` CHECK, `ON DELETE CASCADE` from the venue. Added to
`schema.sql`; `schema.pg.sql`, `rls.pg.sql` and `conflicts.ts` regenerated by
`npm run pg:schema`. `transactions.confirmed_member_id` (TEXT, no FK — a member
row is never deleted, and a forward key would be a third one for the generator
to lift) is in `schema.sql` and reaches existing databases through `addColumn`
in `db.ts` and `ADD COLUMN IF NOT EXISTS` in `pg.ts`. New tables arrive on
existing databases through `CREATE TABLE IF NOT EXISTS`.
