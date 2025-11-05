/**
 * NotificationsAccount — single-file static class
 * - ONE get() supports BOTH views in ONE operation:
 *   (A) Category view  → pinned first, then UNREAD by priority DESC → newest DESC, then READ by priority DESC → newest DESC
 *   (B) ALL view       → ordered UNREAD by priority DESC → newest DESC, then read by priority DESC → newest DESC
 *                        (optionally exclude pinned in ALL to match your spec precisely, see opts.excludePinnedInAll)
 *
 * Sort Key schema (write-time):
 *   SK = P#<0|1>#U#<0|1>#PRI#<invPriority>#TS#<invCreated>#NID#<id>
 *     P: pinned first (0), then non-pinned (1)
 *     U: unread first (0), then read (1)
 *     PRI: inverse so higher priority sorts first
 *     TS: inverse so newer sorts first
 *
 * Table:
 *   PK: USER#<user_id>
 *   SK: as above
 *   GSI1 (UnreadByUser):
 *     PK: USER#<user_id>#UNREAD
 *     SK: P#<0|1>#PRI#<invPriority>#TS#<invCreated>#NID#<id>
 *
 * Notes:
 * - Templates live in JSON config (repo or S3). We store template_id + template_params and fully-resolved fields.
 * - TTL = created_at + 90 days (expires_at).
 * - Preferences: optional hook to exclude categories in reads/counts.
 */

const ScyllaDb = require("../ScyllaDb.js");
const DateTime = require("./DateTime.js");
const SafeUtils = require("./SafeUtils.js");
const ErrorHandler = require("./ErrorHandler.js");
const Logger = require("./UtilityLogger.js");
const crypto = require("crypto");

class NotificationsAccount {
  /* ============================== Constants =============================== */
  static TABLE_NAME = "Notifications";
  static GSI_UNREAD = "UnreadByUser";

  static DEFAULT_AUTO_EXPIRY_TTL_DAYS = 90;
  static MAX_PINNED_NOTIFICATIONS_PER_USER = 3;
  static MAX_PRIORITY_LEVEL_ALLOWED = 10;
  static FAR_FUTURE_EPOCH_FOR_INVERTED_TIME = 4102444800; // ~2100-01-01

  static USER_PARTITION_PREFIX = "USER#";
  static UNREAD_GSI_PARTITION_SUFFIX = "#UNREAD";
  static SORT_PREFIX_FOR_PINNED = "P#0#";
  static SORT_PREFIX_FOR_NON_PINNED = "P#1#";

  // Attribute names
  static ATTR_PK = "PK";
  static ATTR_SK = "SK";
  static ATTR_GSI1PK = "GSI1PK";
  static ATTR_GSI1SK = "GSI1SK";

  static ATTR_NOTIFICATION_ID = "notification_id";
  static ATTR_USER_ID = "user_id";
  static ATTR_CATEGORY = "category";
  static ATTR_TITLE = "title";
  static ATTR_DESCRIPTION = "description";
  static ATTR_TYPE = "type";
  static ATTR_FEATURED = "featured";
  static ATTR_PINNED = "pinned";
  static ATTR_MAIN_VISUAL = "main_visual";
  static ATTR_SECONDARY_VISUAL = "secondary_visual";
  static ATTR_ACTION = "action";
  static ATTR_META = "meta";
  static ATTR_VISIBILITY = "visibility";
  static ATTR_PRIORITY = "priority";
  static ATTR_READ = "read";
  static ATTR_READ_AT = "read_at";
  static ATTR_CREATED_AT = "created_at";
  static ATTR_UPDATED_AT = "updated_at";
  static ATTR_TEMPLATE_ID = "template_id";
  static ATTR_TEMPLATE_PARAMS = "template_params";
  static ATTR_EXPIRES_AT = "expires_at";

  static ALLOWED_TYPES = new Set(["info", "success", "error", "message"]);

  /* ============================= Config (static) =========================== */
  static #partitionKeyAttr = null;
  static #sortKeyAttr = null;
  static #getUserHiddenFilters = null;   // async (userId) => { categories:Set, flags:Set }
  static #templateLoader = null;         // async (templateId) => defaults or null

  /**
   * Configure runtime integrations and hooks.
   */
  static configure({ tableName, gsiUnreadName, getUserHiddenFilters, templateLoader } = {}) {
    if (typeof tableName === "string" && tableName.trim()) NotificationsAccount.TABLE_NAME = tableName.trim();
    if (typeof gsiUnreadName === "string" && gsiUnreadName.trim()) NotificationsAccount.GSI_UNREAD = gsiUnreadName.trim();
    if (typeof getUserHiddenFilters === "function") NotificationsAccount.#getUserHiddenFilters = getUserHiddenFilters;
    if (typeof templateLoader === "function") NotificationsAccount.#templateLoader = templateLoader;

    NotificationsAccount.#partitionKeyAttr = null;
    NotificationsAccount.#sortKeyAttr = null;
  }

  /* =============================== Public API ============================= */

  /**
   * Add a notification using template defaults + params + overrides.
   * Enforces max 3 pinned per user, sets TTL, and logs.
   */
  static async add(payload = {}) {
    const {
      userId, templateId, templateParams, overrides, createdAt
    } = NotificationsAccount.#sanitizeInput({
      userId:         { value: payload.userId,           type: "string", required: true },
      templateId:     { value: payload.templateId ?? "", type: "string", required: false, default: "" },
      templateParams: { value: payload.templateParams,   type: "object", required: false, default: {} },
      overrides:      { value: payload.overrides,        type: "object", required: true },
      createdAt:      { value: payload.createdAt ?? null,type: "int",    required: false, default: null },
    });

    // Load template defaults from external config (repo/S3)
    let base = {};
    try {
      base = await NotificationsAccount.#loadTemplateDefaults(templateId);
    } catch (e) {
      ErrorHandler.add_error("Template load failed", { templateId, err: String(e?.message || e) });
    }

    // Interpolate {{placeholders}} in template strings with provided params
    const interpolated = NotificationsAccount.#interpolatePlaceholders(base, templateParams);

    // Merge call-time overrides over template defaults
    const merged = { ...interpolated, ...(overrides || {}) };

    // Sanitize and normalize core fields
    const normalized = NotificationsAccount.#sanitizeAndNormalizeResolvedFields(merged);

    // Enforce pinned ≤ 3
    if (normalized[NotificationsAccount.ATTR_PINNED]) {
      const currentPinned = await NotificationsAccount.#countPinnedForUser(userId);
      if (currentPinned >= NotificationsAccount.MAX_PINNED_NOTIFICATIONS_PER_USER) {
        ErrorHandler.add_error("Pinned limit exceeded", { userId, currentPinned });
        throw new Error(`Pinned notifications limit (${NotificationsAccount.MAX_PINNED_NOTIFICATIONS_PER_USER}) reached for user ${userId}.`);
      }
    }

    const nowEpoch = NotificationsAccount.#nowEpochSeconds();
    const created_at = Number.isInteger(createdAt) ? createdAt : nowEpoch;
    const expires_at = created_at + (NotificationsAccount.DEFAULT_AUTO_EXPIRY_TTL_DAYS * 24 * 3600);
    const notification_id = NotificationsAccount.#generateId();
    const unread = true;

    const PK = NotificationsAccount.#pkName();
    const SK = NotificationsAccount.#skName();

    const item = {
      [PK]: `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}`,
      [SK]: NotificationsAccount.#composeSortKey({
        pinned: !!normalized[NotificationsAccount.ATTR_PINNED],
        unread,
        priority: normalized[NotificationsAccount.ATTR_PRIORITY],
        created_at,
        notification_id
      }),

      // Unread GSI
      [NotificationsAccount.ATTR_GSI1PK]: `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}${NotificationsAccount.UNREAD_GSI_PARTITION_SUFFIX}`,
      [NotificationsAccount.ATTR_GSI1SK]: NotificationsAccount.#composeUnreadGsiSortKey({
        pinned: !!normalized[NotificationsAccount.ATTR_PINNED],
        priority: normalized[NotificationsAccount.ATTR_PRIORITY],
        created_at,
        notification_id
      }),

      // Resolved fields
      [NotificationsAccount.ATTR_NOTIFICATION_ID]: notification_id,
      [NotificationsAccount.ATTR_USER_ID]: userId,
      [NotificationsAccount.ATTR_CATEGORY]: normalized[NotificationsAccount.ATTR_CATEGORY],
      [NotificationsAccount.ATTR_TITLE]: normalized[NotificationsAccount.ATTR_TITLE],
      [NotificationsAccount.ATTR_DESCRIPTION]: normalized[NotificationsAccount.ATTR_DESCRIPTION],
      [NotificationsAccount.ATTR_TYPE]: normalized[NotificationsAccount.ATTR_TYPE],
      [NotificationsAccount.ATTR_FEATURED]: !!normalized[NotificationsAccount.ATTR_FEATURED],
      [NotificationsAccount.ATTR_PINNED]: !!normalized[NotificationsAccount.ATTR_PINNED],
      [NotificationsAccount.ATTR_MAIN_VISUAL]: normalized[NotificationsAccount.ATTR_MAIN_VISUAL] || null,
      [NotificationsAccount.ATTR_SECONDARY_VISUAL]: normalized[NotificationsAccount.ATTR_SECONDARY_VISUAL] || null,
      [NotificationsAccount.ATTR_ACTION]: normalized[NotificationsAccount.ATTR_ACTION] || null,
      [NotificationsAccount.ATTR_META]: normalized[NotificationsAccount.ATTR_META] || null,
      [NotificationsAccount.ATTR_VISIBILITY]: normalized[NotificationsAccount.ATTR_VISIBILITY] || "default",
      [NotificationsAccount.ATTR_PRIORITY]: normalized[NotificationsAccount.ATTR_PRIORITY],
      [NotificationsAccount.ATTR_READ]: false,
      [NotificationsAccount.ATTR_READ_AT]: null,
      [NotificationsAccount.ATTR_CREATED_AT]: created_at,
      [NotificationsAccount.ATTR_UPDATED_AT]: created_at,

      // Template trace
      [NotificationsAccount.ATTR_TEMPLATE_ID]: templateId || null,
      [NotificationsAccount.ATTR_TEMPLATE_PARAMS]: templateParams || null,

      // TTL
      [NotificationsAccount.ATTR_EXPIRES_AT]: expires_at
    };

    await ScyllaDb.putItem(NotificationsAccount.TABLE_NAME, item);

    NotificationsAccount.#logSafe(() => Logger.writeLog({
      flag: "notification_create",
      action: "create",
      message: "Notification created",
      data: { userId, notification_id, pinned: !!normalized[NotificationsAccount.ATTR_PINNED], category: item[NotificationsAccount.ATTR_CATEGORY], created_at }
    }));

    return NotificationsAccount.#escapeOutput(item);
  }

  /** Hard delete by id */
  static async delete(userIdRaw, notificationIdRaw) {
    const { userId, notificationId } = NotificationsAccount.#sanitizeInput({
      userId:         { value: userIdRaw,        type: "string", required: true },
      notificationId: { value: notificationIdRaw, type: "string", required: true }
    });

    const existing = await NotificationsAccount.#getById(userId, notificationId);
    if (!existing) {
      ErrorHandler.add_error("Notification not found for delete", { userId, notificationId });
      return false;
    }

    const PK = NotificationsAccount.#pkName();
    const SK = NotificationsAccount.#skName();

    const ok = await ScyllaDb.deleteItem(NotificationsAccount.TABLE_NAME, { [PK]: existing[PK], [SK]: existing[SK] });

    NotificationsAccount.#logSafe(() => Logger.writeLog({
      flag: "notification_delete",
      action: "delete",
      message: "Notification deleted",
      data: { userId, notificationId, ok: !!ok }
    }));

    return !!ok;
  }

  static async markRead(userIdRaw, notificationIdRaw)  { return NotificationsAccount.#flipReadState(userIdRaw, notificationIdRaw, true);  }
  static async markUnread(userIdRaw, notificationIdRaw){ return NotificationsAccount.#flipReadState(userIdRaw, notificationIdRaw, false); }

  static async markAllRead(userIdRaw, { pageLimit = 50 } = {}) {
    const { userId, limit } = NotificationsAccount.#sanitizeInput({
      userId: { value: userIdRaw, type: "string", required: true },
      limit:  { value: pageLimit, type: "int",    required: false, default: 50 }
    });

    let lastKey = null;
    let total = 0;

    do {
      const batch = await NotificationsAccount.#queryUnreadPartition(userId, { limit, exclusiveStartKey: lastKey });
      for (const it of batch.items) {
        await NotificationsAccount.#flipReadState(userId, it[NotificationsAccount.ATTR_NOTIFICATION_ID], true);
        total++;
      }
      lastKey = batch.lastKey;
    } while (lastKey);

    NotificationsAccount.#logSafe(() => Logger.writeLog({
      flag: "notification_bulk_update",
      action: "mark_all_read",
      message: "All unread notifications marked as read",
      data: { userId, total }
    }));

    return total;
  }

  /**
   * ONE get() that supports BOTH:
   *  - Category view (pass {category}) → pinned first, then UNREAD (prio DESC → newest DESC), then READ (prio DESC → newest DESC)
   *  - ALL view (omit category)       → UNREAD (prio DESC → newest DESC), then READ (prio DESC → newest DESC)
   *
   * Implementation detail (ONE operation):
   *  - For category: Query PK only; FilterExpression on category (keeps global SK order intact, includes pinned block naturally).
   *  - For ALL: use sort key begins_with 'P#1#' to exclude pinned in a single Query, so order is unread→read by priority/newest only.
   *    (If you want pinned first for ALL as well, set opts.excludePinnedInAll=false).
   */
  static async get(userIdRaw, {
    category = null,
    visibility = null,
    priorityMin = null,
    priorityMax = null,
    limit = 25,
    exclusiveStartKey = null,
    excludePinnedInAll = true // true = EXACTLY your "ALL ordered by priority→newest→unread" (no pinned-first)
  } = {}) {
    const cleaned = NotificationsAccount.#sanitizeInput({
      userId:          { value: userIdRaw, type: "string", required: true },
      category:        { value: category,   type: "string", required: false, default: null },
      visibility:      { value: visibility, type: "string", required: false, default: null },
      priorityMin:     { value: priorityMin,type: "int",    required: false, default: null },
      priorityMax:     { value: priorityMax,type: "int",    required: false, default: null },
      limit:           { value: limit,      type: "int",    required: false, default: 25 },
      excludePinnedInAll: { value: excludePinnedInAll, type: "bool", required: false, default: true }
    });

    const PK = NotificationsAccount.#pkName();
    const SK = NotificationsAccount.#skName();

    // ONE Query — condition differs slightly depending on whether we want to exclude pinned in the ALL view.
    let KeyConditionExpression = "#pk = :pk";
    const ExpressionAttributeNames = { "#pk": PK };
    const ExpressionAttributeValues = ScyllaDb.marshalItem({
      ":pk": `${NotificationsAccount.USER_PARTITION_PREFIX}${cleaned.userId}`
    });

    if (!cleaned.category && cleaned.excludePinnedInAll) {
      // ALL view with pinned excluded in ONE operation: only scan non-pinned block via begins_with(SK, 'P#1#')
      KeyConditionExpression = "#pk = :pk AND begins_with(#sk, :skprefix)";
      ExpressionAttributeNames["#sk"] = SK;
      Object.assign(
        ExpressionAttributeValues, // already marshalled; append safely
        ScyllaDb.marshalItem({ ":skprefix": NotificationsAccount.SORT_PREFIX_FOR_NON_PINNED })
      );
    }

    const queryPayload = {
      TableName: NotificationsAccount.TABLE_NAME,
      KeyConditionExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      Limit: cleaned.limit,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {})
    };

    // Optional server-side filter (preserves order returned)
    const filterParts = [];
    const names = queryPayload.ExpressionAttributeNames;
    const rawVals = {};

    if (cleaned.category) {
      names["#category"] = NotificationsAccount.ATTR_CATEGORY;
      rawVals[":category"] = cleaned.category;
      filterParts.push("#category = :category");
    }
    if (cleaned.visibility) {
      names["#visibility"] = NotificationsAccount.ATTR_VISIBILITY;
      rawVals[":visibility"] = cleaned.visibility;
      filterParts.push("#visibility = :visibility");
    }
    if (Number.isInteger(cleaned.priorityMin)) {
      names["#priority"] = NotificationsAccount.ATTR_PRIORITY;
      rawVals[":pmin"] = cleaned.priorityMin;
      filterParts.push("#priority >= :pmin");
    }
    if (Number.isInteger(cleaned.priorityMax)) {
      names["#priority"] = NotificationsAccount.ATTR_PRIORITY;
      rawVals[":pmax"] = cleaned.priorityMax;
      filterParts.push("#priority <= :pmax");
    }

    // Preferences: exclude categories/flags (categories handled here)
    try {
      if (NotificationsAccount.#getUserHiddenFilters) {
        const prefs = await NotificationsAccount.#getUserHiddenFilters(cleaned.userId);
        const excludeCategories = prefs?.categories instanceof Set ? prefs.categories : new Set();
        if (excludeCategories.size > 0) {
          let idx = 0;
          const inNames = [];
          for (const cat of excludeCategories) {
            const ph = `:xc${idx++}`;
            rawVals[ph] = cat;
            inNames.push(ph);
          }
          names["#category"] = NotificationsAccount.ATTR_CATEGORY;
          filterParts.push(`NOT (#category IN (${inNames.join(", ")}))`);
        }
      }
    } catch (e) {
      ErrorHandler.add_error("getUserHiddenFilters failed", { userId: cleaned.userId, err: String(e?.message || e) });
    }

    if (filterParts.length) {
      queryPayload.FilterExpression = filterParts.join(" AND ");
      queryPayload.ExpressionAttributeValues = ScyllaDb.marshalItem({
        ...ScyllaDb.unmarshalItem(queryPayload.ExpressionAttributeValues),
        ...rawVals
      });
    }

    const resp = await ScyllaDb.request("Query", queryPayload);
    const items = (resp.Items || []).map(ScyllaDb.unmarshalItem).map((x) => NotificationsAccount.#escapeOutput(x));

    // IMPORTANT: Returned order is already:
    //   - If category provided: pinned → unread(pri DESC → newest DESC) → read(pri DESC → newest DESC)
    //   - If ALL with excludePinnedInAll=true: unread(pri DESC → newest DESC) → read(pri DESC → newest DESC)
    return {
      items,
      count: resp?.Count ?? 0,
      scannedCount: resp?.ScannedCount ?? 0,
      lastKey: resp?.LastEvaluatedKey ?? null
    };
  }

  /** Count (optionally unreadOnly and/or category) */
  static async count(userIdRaw, { unreadOnly = false, category = null } = {}) {
    const cleaned = NotificationsAccount.#sanitizeInput({
      userId:     { value: userIdRaw, type: "string", required: true },
      unreadOnly: { value: unreadOnly, type: "bool",   required: false, default: false },
      category:   { value: category,   type: "string", required: false, default: null }
    });

    const names = {};
    const rawVals = {};
    const filterParts = [];

    if (cleaned.category) {
      names["#category"] = NotificationsAccount.ATTR_CATEGORY;
      rawVals[":category"] = cleaned.category;
      filterParts.push("#category = :category");
    }

    // Preferences exclusions
    try {
      if (NotificationsAccount.#getUserHiddenFilters) {
        const prefs = await NotificationsAccount.#getUserHiddenFilters(cleaned.userId);
        const excludeCategories = prefs?.categories instanceof Set ? prefs.categories : new Set();
        if (excludeCategories.size > 0) {
          let idx = 0;
          const inNames = [];
          for (const cat of excludeCategories) {
            const ph = `:xc${idx++}`;
            rawVals[ph] = cat;
            inNames.push(ph);
          }
          names["#category"] = NotificationsAccount.ATTR_CATEGORY;
          filterParts.push(`NOT (#category IN (${inNames.join(", ")}))`);
        }
      }
    } catch (e) {
      ErrorHandler.add_error("getUserHiddenFilters failed (count)", { userId: cleaned.userId, err: String(e?.message || e) });
    }

    if (cleaned.unreadOnly) {
      // GSI unread fast-path
      const payload = {
        TableName: NotificationsAccount.TABLE_NAME,
        IndexName: NotificationsAccount.GSI_UNREAD,
        KeyConditionExpression: "#gpk = :gpk",
        ExpressionAttributeNames: { "#gpk": NotificationsAccount.ATTR_GSI1PK, ...names },
        ExpressionAttributeValues: ScyllaDb.marshalItem({
          ":gpk": `${NotificationsAccount.USER_PARTITION_PREFIX}${cleaned.userId}${NotificationsAccount.UNREAD_GSI_PARTITION_SUFFIX}`,
          ...rawVals
        }),
        Select: "COUNT",
        ...(filterParts.length ? { FilterExpression: filterParts.join(" AND ") } : {})
      };
      const resp = await ScyllaDb.request("Query", payload);
      return resp?.Count ?? 0;
    }

    const PK = NotificationsAccount.#pkName();
    const payload = {
      TableName: NotificationsAccount.TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": PK, ...names },
      ExpressionAttributeValues: ScyllaDb.marshalItem({ ":pk": `${NotificationsAccount.USER_PARTITION_PREFIX}${cleaned.userId}`, ...rawVals }),
      Select: "COUNT",
      ...(filterParts.length ? { FilterExpression: filterParts.join(" AND ") } : {})
    };
    const resp = await ScyllaDb.request("Query", payload);
    return resp?.Count ?? 0;
  }

  static async hasAny(userIdRaw) {
    const { userId } = NotificationsAccount.#sanitizeInput({ userId: { value: userIdRaw, type: "string", required: true } });
    const PK = NotificationsAccount.#pkName();
    const resp = await ScyllaDb.request("Query", {
      TableName: NotificationsAccount.TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": PK },
      ExpressionAttributeValues: ScyllaDb.marshalItem({ ":pk": `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}` }),
      Limit: 1
    });
    return (resp?.Count ?? 0) > 0;
  }

  static async hasUnread(userIdRaw) {
    const { userId } = NotificationsAccount.#sanitizeInput({ userId: { value: userIdRaw, type: "string", required: true } });
    const resp = await ScyllaDb.request("Query", {
      TableName: NotificationsAccount.TABLE_NAME,
      IndexName: NotificationsAccount.GSI_UNREAD,
      KeyConditionExpression: "#gpk = :gpk",
      ExpressionAttributeNames: { "#gpk": NotificationsAccount.ATTR_GSI1PK },
      ExpressionAttributeValues: ScyllaDb.marshalItem({
        ":gpk": `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}${NotificationsAccount.UNREAD_GSI_PARTITION_SUFFIX}`
      }),
      Limit: 1
    });
    return (resp?.Count ?? 0) > 0;
  }

  /* ============================= Private (static) ========================== */
  static #nowEpochSeconds() {
    try {
      if (DateTime && typeof DateTime.nowEpochSeconds === "function") {
        return DateTime.nowEpochSeconds();
      }
    } catch (_) {}
    return Math.floor(Date.now() / 1000);
  }

  static #inversePriority(priority) {
    const p = Math.max(1, Math.min(NotificationsAccount.MAX_PRIORITY_LEVEL_ALLOWED, Number(priority) || 0));
    return NotificationsAccount.MAX_PRIORITY_LEVEL_ALLOWED - p;
  }

  static #inverseTimestamp(epochSeconds) {
    const n = Number.isFinite(epochSeconds) ? epochSeconds : NotificationsAccount.#nowEpochSeconds();
    return Math.max(0, NotificationsAccount.FAR_FUTURE_EPOCH_FOR_INVERTED_TIME - n);
  }

  static #composeSortKey({ pinned, unread, priority, created_at, notification_id }) {
    const P = pinned ? 0 : 1;
    const U = unread ? 0 : 1;
    const PRI_INV = NotificationsAccount.#inversePriority(priority);
    const TS_INV = NotificationsAccount.#inverseTimestamp(created_at);
    const NID = String(notification_id || "");
    return `P#${P}#U#${U}#PRI#${PRI_INV}#TS#${TS_INV}#NID#${NID}`;
  }

  static #composeUnreadGsiSortKey({ pinned, priority, created_at, notification_id }) {
    const P = pinned ? 0 : 1;
    const PRI_INV = NotificationsAccount.#inversePriority(priority);
    const TS_INV = NotificationsAccount.#inverseTimestamp(created_at);
    const NID = String(notification_id || "");
    return `P#${P}#PRI#${PRI_INV}#TS#${TS_INV}#NID#${NID}`;
  }

  static #escapeOutput(notification) {
    if (!notification || typeof notification !== "object") return notification;
    const clone = { ...notification };

    if (typeof clone[NotificationsAccount.ATTR_TITLE] === "string") {
      clone[NotificationsAccount.ATTR_TITLE] = SafeUtils.sanitizeString(clone[NotificationsAccount.ATTR_TITLE], true);
    }
    if (typeof clone[NotificationsAccount.ATTR_DESCRIPTION] === "string") {
      clone[NotificationsAccount.ATTR_DESCRIPTION] = SafeUtils.sanitizeString(clone[NotificationsAccount.ATTR_DESCRIPTION], true);
    }
    if (clone[NotificationsAccount.ATTR_ACTION] && typeof clone[NotificationsAccount.ATTR_ACTION] === "object") {
      const a = { ...clone[NotificationsAccount.ATTR_ACTION] };
      if (typeof a.text === "string") a.text = SafeUtils.sanitizeString(a.text, true);
      if (typeof a.icon === "string") a.icon = SafeUtils.sanitizeString(a.icon, true);
      if (typeof a.url === "string") a.url = SafeUtils.escUrl(a.url);
      clone[NotificationsAccount.ATTR_ACTION] = a;
    }
    if (clone[NotificationsAccount.ATTR_MAIN_VISUAL] && typeof clone[NotificationsAccount.ATTR_MAIN_VISUAL] === "object") {
      const m = { ...clone[NotificationsAccount.ATTR_MAIN_VISUAL] };
      if (typeof m.label === "string") m.label = SafeUtils.sanitizeString(m.label, true);
      clone[NotificationsAccount.ATTR_MAIN_VISUAL] = m;
    }
    if (clone[NotificationsAccount.ATTR_SECONDARY_VISUAL] && typeof clone[NotificationsAccount.ATTR_SECONDARY_VISUAL] === "object") {
      const s = { ...clone[NotificationsAccount.ATTR_SECONDARY_VISUAL] };
      if (typeof s.label === "string") s.label = SafeUtils.sanitizeString(s.label, true);
      clone[NotificationsAccount.ATTR_SECONDARY_VISUAL] = s;
    }
    return clone;
  }

  static async #countPinnedForUser(userId) {
    const PK = NotificationsAccount.#pkName();
    const SK = NotificationsAccount.#skName();
    const resp = await ScyllaDb.request("Query", {
      TableName: NotificationsAccount.TABLE_NAME,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :skprefix)",
      ExpressionAttributeNames: { "#pk": PK, "#sk": SK },
      ExpressionAttributeValues: ScyllaDb.marshalItem({
        ":pk": `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}`,
        ":skprefix": NotificationsAccount.SORT_PREFIX_FOR_PINNED
      }),
      Select: "COUNT",
      Limit: NotificationsAccount.MAX_PINNED_NOTIFICATIONS_PER_USER + 1
    });
    return resp?.Count ?? 0;
  }

  static async #getById(userId, notificationId) {
    const PK = NotificationsAccount.#pkName();
    const payload = {
      TableName: NotificationsAccount.TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": PK, "#nid": NotificationsAccount.ATTR_NOTIFICATION_ID },
      ExpressionAttributeValues: ScyllaDb.marshalItem({
        ":pk": `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}`,
        ":nid": notificationId
      }),
      FilterExpression: "#nid = :nid"
    };
    const resp = await ScyllaDb.request("Query", payload);
    const items = (resp.Items || []).map(ScyllaDb.unmarshalItem);
    return items.length ? items[0] : null;
  }

  static async #queryUnreadPartition(userId, { limit = 50, exclusiveStartKey = null } = {}) {
    const resp = await ScyllaDb.request("Query", {
      TableName: NotificationsAccount.TABLE_NAME,
      IndexName: NotificationsAccount.GSI_UNREAD,
      KeyConditionExpression: "#gpk = :gpk",
      ExpressionAttributeNames: { "#gpk": NotificationsAccount.ATTR_GSI1PK },
      ExpressionAttributeValues: ScyllaDb.marshalItem({
        ":gpk": `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}${NotificationsAccount.UNREAD_GSI_PARTITION_SUFFIX}`
      }),
      Limit: limit,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {})
    });
    return {
      items: (resp.Items || []).map(ScyllaDb.unmarshalItem),
      lastKey: resp?.LastEvaluatedKey ?? null
    };
  }

  static async #flipReadState(userIdRaw, notificationIdRaw, toRead) {
    const { userId, notificationId } = NotificationsAccount.#sanitizeInput({
      userId:        { value: userIdRaw,        type: "string", required: true },
      notificationId:{ value: notificationIdRaw, type: "string", required: true }
    });

    const existing = await NotificationsAccount.#getById(userId, notificationId);
    if (!existing) {
      ErrorHandler.add_error("Notification not found for read toggle", { userId, notificationId });
      return false;
    }

    const wasRead = !!existing[NotificationsAccount.ATTR_READ];
    if (wasRead === !!toRead) return NotificationsAccount.#escapeOutput(existing);

    const now = NotificationsAccount.#nowEpochSeconds();
    const willBeUnread = !toRead;

    const PK = NotificationsAccount.#pkName();
    const SK = NotificationsAccount.#skName();

    const newItem = {
      ...existing,
      [SK]: NotificationsAccount.#composeSortKey({
        pinned: !!existing[NotificationsAccount.ATTR_PINNED],
        unread: willBeUnread,
        priority: existing[NotificationsAccount.ATTR_PRIORITY],
        created_at: existing[NotificationsAccount.ATTR_CREATED_AT],
        notification_id: existing[NotificationsAccount.ATTR_NOTIFICATION_ID]
      }),
      [NotificationsAccount.ATTR_READ]: !!toRead,
      [NotificationsAccount.ATTR_READ_AT]: toRead ? now : null,
      [NotificationsAccount.ATTR_UPDATED_AT]: now
    };

    if (willBeUnread) {
      newItem[NotificationsAccount.ATTR_GSI1PK] = `${NotificationsAccount.USER_PARTITION_PREFIX}${userId}${NotificationsAccount.UNREAD_GSI_PARTITION_SUFFIX}`;
      newItem[NotificationsAccount.ATTR_GSI1SK] = NotificationsAccount.#composeUnreadGsiSortKey({
        pinned: !!existing[NotificationsAccount.ATTR_PINNED],
        priority: existing[NotificationsAccount.ATTR_PRIORITY],
        created_at: existing[NotificationsAccount.ATTR_CREATED_AT],
        notification_id: existing[NotificationsAccount.ATTR_NOTIFICATION_ID]
      });
    } else {
      delete newItem[NotificationsAccount.ATTR_GSI1PK];
      delete newItem[NotificationsAccount.ATTR_GSI1SK];
    }

    await ScyllaDb.deleteItem(NotificationsAccount.TABLE_NAME, { [PK]: existing[PK], [SK]: existing[SK] });
    await ScyllaDb.putItem(NotificationsAccount.TABLE_NAME, newItem);

    NotificationsAccount.#logSafe(() => Logger.writeLog({
      flag: "notification_update",
      action: toRead ? "mark_read" : "mark_unread",
      message: `Notification ${toRead ? "marked read" : "marked unread"}`,
      data: { userId, notificationId }
    }));

    return NotificationsAccount.#escapeOutput(newItem);
  }

  static #generateId(size = 20) {
    return crypto.randomBytes(size).toString("base64url");
  }

  static #pkName() {
    if (!NotificationsAccount.#partitionKeyAttr || !NotificationsAccount.#sortKeyAttr) {
      const schema = ScyllaDb.getSchemaFromConfig(NotificationsAccount.TABLE_NAME) || {};
      NotificationsAccount.#partitionKeyAttr = schema.keys?.partition || NotificationsAccount.ATTR_PK;
      NotificationsAccount.#sortKeyAttr      = schema.keys?.sort || NotificationsAccount.ATTR_SK;
    }
    return NotificationsAccount.#partitionKeyAttr;
  }

  static #skName() {
    if (!NotificationsAccount.#sortKeyAttr) NotificationsAccount.#pkName();
    return NotificationsAccount.#sortKeyAttr;
  }

  static async #loadTemplateDefaults(templateId) {
    if (!templateId) return {};
    if (NotificationsAccount.#templateLoader) {
      const got = await NotificationsAccount.#templateLoader(templateId);
      return (got && typeof got === "object") ? got.defaults || got : {};
    }
    return {}; // If no loader provided, caller must supply all fields via overrides.
  }

  static #interpolatePlaceholders(obj, params = {}) {
    if (!obj || typeof obj !== "object") return {};
    const paramMap = params || {};
    const replaceInString = (s) =>
      String(s).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => (key in paramMap ? String(paramMap[key]) : ""));

    const walk = (v) => {
      if (v == null) return v;
      if (typeof v === "string") return replaceInString(v);
      if (Array.isArray(v)) return v.map(walk);
      if (typeof v === "object") {
        const out = {};
        for (const [k, val] of Object.entries(v)) out[k] = walk(val);
        return out;
      }
      return v;
    };
    return walk(obj);
  }

  static #sanitizeAndNormalizeResolvedFields(raw = {}) {
    // required: category, title, description
    const cleaned = NotificationsAccount.#sanitizeInput({
      [NotificationsAccount.ATTR_CATEGORY]:        { value: raw[NotificationsAccount.ATTR_CATEGORY],        type: "string", required: true },
      [NotificationsAccount.ATTR_TITLE]:           { value: raw[NotificationsAccount.ATTR_TITLE],           type: "string", required: true },
      [NotificationsAccount.ATTR_DESCRIPTION]:     { value: raw[NotificationsAccount.ATTR_DESCRIPTION],     type: "string", required: true },
      [NotificationsAccount.ATTR_TYPE]:            { value: raw[NotificationsAccount.ATTR_TYPE] ?? "info",  type: "string", required: false, default: "info" },
      [NotificationsAccount.ATTR_FEATURED]:        { value: raw[NotificationsAccount.ATTR_FEATURED] ?? false, type: "bool", required: false, default: false },
      [NotificationsAccount.ATTR_PINNED]:          { value: raw[NotificationsAccount.ATTR_PINNED] ?? false,   type: "bool", required: false, default: false },
      [NotificationsAccount.ATTR_MAIN_VISUAL]:     { value: raw[NotificationsAccount.ATTR_MAIN_VISUAL] ?? null, type: "object", required: false, default: null },
      [NotificationsAccount.ATTR_SECONDARY_VISUAL]:{ value: raw[NotificationsAccount.ATTR_SECONDARY_VISUAL] ?? null, type: "object", required: false, default: null },
      [NotificationsAccount.ATTR_ACTION]:          { value: raw[NotificationsAccount.ATTR_ACTION] ?? null, type: "object", required: false, default: null },
      [NotificationsAccount.ATTR_META]:            { value: raw[NotificationsAccount.ATTR_META] ?? null, type: "object", required: false, default: null },
      [NotificationsAccount.ATTR_VISIBILITY]:      { value: raw[NotificationsAccount.ATTR_VISIBILITY] ?? "default", type: "string", required: false, default: "default" },
      [NotificationsAccount.ATTR_PRIORITY]:        { value: raw[NotificationsAccount.ATTR_PRIORITY] ?? 3, type: "int", required: false, default: 3 }
    });

    if (!NotificationsAccount.ALLOWED_TYPES.has(cleaned[NotificationsAccount.ATTR_TYPE])) {
      cleaned[NotificationsAccount.ATTR_TYPE] = "info";
    }
    const pr = Number(cleaned[NotificationsAccount.ATTR_PRIORITY]);
    cleaned[NotificationsAccount.ATTR_PRIORITY] =
      pr >= 1 && pr <= NotificationsAccount.MAX_PRIORITY_LEVEL_ALLOWED ? pr : 3;

    return cleaned;
  }

  static #logSafe(fn) {
    try { if (typeof fn === "function") fn(); } catch (e) {
      // Swallow logger route errors to avoid breaking core flow
      ErrorHandler.add_error("Logger.writeLog failed", { err: String(e?.message || e) });
    }
  }

  // Simple input sanitization replacement for SafeUtils.sanitizeValidate
  static #sanitizeInput(schema) {
    const result = {};
    for (const [key, config] of Object.entries(schema)) {
      const { value, type, required = false, default: defaultValue } = config;
      
      if (value === null || value === undefined) {
        if (required) {
          throw new Error(`Required field "${key}" is missing`);
        }
        result[key] = defaultValue;
        continue;
      }

      switch (type) {
        case "string":
          result[key] = String(value);
          break;
        case "int":
          result[key] = parseInt(value, 10);
          break;
        case "bool":
          result[key] = Boolean(value);
          break;
        case "object":
          result[key] = typeof value === "object" ? value : defaultValue;
          break;
        default:
          result[key] = value;
      }
    }
    return result;
  }
}

module.exports = NotificationsAccount;