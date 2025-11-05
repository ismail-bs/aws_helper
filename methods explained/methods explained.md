NotificationsAccount — METHOD SUMMARY
=====================================

PUBLIC STATIC API
-----------------

1) add({ userId, templateId, templateParams?, overrides?, createdAt? }) : Promise<NotificationItem>
   • Purpose: Create a new notification from a JSON template, interpolate placeholders with templateParams, then apply optional overrides (e.g., category/pinned/priority). Enforces pinned ≤ 3. Persists one item with TTL and unread GSI keys.
   • Params:
     - userId: string (required) — target user.
     - templateId: string (required) — key to fetch template defaults.
     - templateParams: object (optional) — map for {{placeholders}} in title/description/action/meta.
     - overrides: object (optional) — fields to override after interpolation (e.g., { pinned:true, priority:10 }).
     - createdAt: number (optional, epoch seconds) — creation time; defaults to now.
   • Why it’s here: Single entrypoint to add notifications while keeping schema rules (ordering keys, TTL, unread GSI, pin-limit) in one place.

2) get(userId, { category?, visibility?, priorityMin?, priorityMax?, limit?, exclusiveStartKey?, excludePinnedInAll? }) : Promise<{items, count, scannedCount, lastKey}>
   • Purpose: Return notifications in ONE DB Query in the required order:
     - If category is provided: pinned → UNREAD (priority DESC → newest DESC) → READ (priority DESC → newest DESC).
     - If category is NOT provided (ALL view): exclude pinned via begins_with(SK,'P#1#') → UNREAD (pri DESC → newest) → READ (pri DESC → newest).
   • Params:
     - userId: string (required).
     - category: string (optional) — category filter; when set, pinned are included.
     - visibility: string (optional) — filter.
     - priorityMin / priorityMax: number (optional) — filter bounds.
     - limit: number (optional, default 50) — page size.
     - exclusiveStartKey: any (optional) — for pagination.
     - excludePinnedInAll: boolean (optional; true when no category) — implemented by begins_with(SK,'P#1#').
   • Why it’s here: Exact ordering is encoded in SK; this method issues a single partition Query and (optionally) a begins_with on SK to exclude pinned for ALL view. No Scan.

3) markRead(userId, notificationId) : Promise<NotificationItem | false>
   • Purpose: Flip a single notification to READ. Rewrites the item to update the SK (U#1), removes unread GSI attributes, sets read_at/updated_at.
   • Params:
     - userId: string (required)
     - notificationId: string (required)
   • Why it’s here: Moving between unread/read blocks requires changing the sort key + GSI membership; this encapsulates the atomic delete+put.

4) markUnread(userId, notificationId) : Promise<NotificationItem | false>
   • Purpose: Flip a single notification to UNREAD. Rewrites SK (U#0), re-adds unread GSI keys, clears read_at, updates updated_at.
   • Params:
     - userId: string (required)
     - notificationId: string (required)
   • Why it’s here: Symmetric control to restore item into the unread block with correct ordering/GSI.

PRIVATE STATIC HELPERS
----------------------

#now() : number
  • Purpose: Current epoch seconds (uses DateTime.nowEpochSeconds() if available; fallback Date.now()).
  • Why: Stable timestamp source for keys/TTL.

#invPri(priority: number) : number
  • Purpose: Convert priority (1..MAX) into an inverse value so higher priority sorts first under ascending key order.
  • Why: Implements “priority DESC” using a single ascending SK.

#invTs(epoch: number) : number
  • Purpose: Convert created_at into an inverted timestamp (FAR_FUTURE - t) so newer items sort first with ascending SK.
  • Why: Implements “newest DESC” without a second index.

#composeSK({ pinned, unread, priority, created_at, notification_id }) : string
  • Purpose: Build the base table SK: `P#<0|1>#U#<0|1>#PRI#<invPri>#TS#<invTs>#NID#<id>`.
  • Why: Encodes the entire ordering: pinned → unread → priority(desc) → newest(desc) → tie-breaker by id.

#composeUnreadSK({ pinned, priority, created_at, notification_id }) : string
  • Purpose: Build the unread GSI sort key: `P#<0|1>#PRI#<invPri>#TS#<invTs>#NID#<id>`.
  • Why: Fast unread listing/hasUnread/unread counts while preserving the same ordering dimensions.

#pk() : string   |  #sk() : string
  • Purpose: Resolve actual PK/SK attribute names from ScyllaDb schema config (fallback to "PK"/"SK").
  • Why: Allows schema-driven attribute names without hardcoding.

#id(size=20) : string
  • Purpose: Generate a base64url id for notification_id.
  • Why: Collision-resistant identifiers for deterministic SK tie-breaker.

#countPinned(userId: string) : Promise<number>
  • Purpose: Count pinned items with `Query` + `begins_with(SK,'P#0#')` (Select='COUNT', Limit=MAX_PINNED+1).
  • Why: Enforce “max 3 pinned” at write-time without a secondary index.

#getById(userId: string, notificationId: string) : Promise<NotificationItem | null>
  • Purpose: Partition `Query` by PK and filter on notification_id to fetch a single item.
  • Why: Dynamo/Alternator-friendly lookup without extra indexes; used by #flip.

#flip(userId: string, notificationId: string, toRead: boolean) : Promise<NotificationItem | false>
  • Purpose: Internal toggle (read↔unread). Recompute SK/GSI, delete old item (old SK), put new item (new SK).
  • Why: Keeps ordering and GSI membership correct when state changes.

NOTES
-----
• All reads are `Query` (never `Scan`).  
• Single-table design; unread GSI only for unread fast paths.  
• Templates: add() loads defaults by templateId, interpolates with templateParams, then applies overrides (rare).  
• Ordering is entirely encoded in SK so `get()` needs just one Query (plus optional begins_with to exclude pinned for ALL).
