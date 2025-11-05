/**
 * SEED + GET DEMO (no loops)
 * - Uses TEMPLATE ID + templateParams (placeholders). Overrides used ONLY where necessary:
 *     • The 5-item "abc" scenario uses minimal overrides to set category=abc, pinned, title labels, and custom priorities.
 *     • All other adds use templateParams only (no overrides).
 * - Two GETs:
 *     1) category=abc  → pinned → UNREAD (priority DESC → newest DESC) → READ (priority DESC → newest DESC)
 *     2) ALL (exclude pinned) → UNREAD (priority DESC → newest DESC) → READ (priority DESC → newest DESC)
 * - LAST: mark three abc items as READ, then GET category=abc again.
 *
 * Assumes NotificationsAccount implements add({ userId, templateId, templateParams, overrides?, createdAt? })
 * and is wired to load templates (from your CONFIG/S3/repo).
 */

import NotificationsAccount from "./NotificationsAccount.js";

const userId = "u-raw";
let ts = Math.floor(Date.now()/1000) - 1000;

/* =========================
 * 1) Your exact “abc” scenario
 *    (params drive string replacement; overrides only for category/pinned/title/priority)
 * ========================= */
const A01 = await NotificationsAccount.add({
  userId,
  templateId: "paymentSucceeded",
  templateParams: { amount: "$12.00", userName: "Bee", invoiceId: "INV-100", currency: "USD" },
  overrides: { category: "abc", title: "hgf", priority: 10, pinned: true },
  createdAt: ++ts
});
const A02 = await NotificationsAccount.add({
  userId,
  templateId: "paymentSucceeded",
  templateParams: { amount: "$9.50", userName: "Bee", invoiceId: "INV-101", currency: "USD" },
  overrides: { category: "abc", title: "gfd", priority: 8 },
  createdAt: ++ts
});
const A03 = await NotificationsAccount.add({
  userId,
  templateId: "paymentSucceeded",
  templateParams: { amount: "$3.33", userName: "Bee", invoiceId: "INV-102", currency: "USD" },
  overrides: { category: "abc", title: "hg", priority: 2 },
  createdAt: ++ts
});
const A04 = await NotificationsAccount.add({
  userId,
  templateId: "paymentSucceeded",
  templateParams: { amount: "$10.00", userName: "Bee", invoiceId: "INV-103", currency: "USD" },
  overrides: { category: "abc", title: "gfd", priority: 10 },
  createdAt: ++ts
});
const A05 = await NotificationsAccount.add({
  userId,
  templateId: "paymentSucceeded",
  templateParams: { amount: "$8.80", userName: "Bee", invoiceId: "INV-104", currency: "USD" },
  overrides: { category: "abc", title: "hgfh", priority: 8 },
  createdAt: ++ts
});

/* =========================
 * 2) 95 more adds (templateParams only; NO overrides)
 *    – Categories mixed to stress ordering; placeholders filled.
 * ========================= */

// 6..20
const A06 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$20", invoiceId:"INV-6",  reason:"card_declined" },                                  createdAt: ++ts });
const A07 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip7", moderator:"Sam", mediaId:"M7", reviewId:"R7" },                         createdAt: ++ts });
const A08 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Bee", time:"10:30" },                                                          createdAt: ++ts });
const A09 = await NotificationsAccount.add({ userId, templateId:"systemMaintenance",          templateParams:{ startTime:"12:00", endTime:"13:00" },                                                     createdAt: ++ts });
const A10 = await NotificationsAccount.add({ userId, templateId:"accountWelcome",             templateParams:{ userName:"Bee", createdDate:"2025-09-01" },                                               createdAt: ++ts });
const A11 = await NotificationsAccount.add({ userId, templateId:"subscriptionRenewalReminder",templateParams:{ renewalDate:"2025-10-01", daysRemaining:"13" },                                          createdAt: ++ts });
const A12 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$12", userName:"Bee", invoiceId:"INV-12", currency:"USD" },                        createdAt: ++ts });
const A13 = await NotificationsAccount.add({ userId, templateId:"adminAnnouncement",          templateParams:{ featureName:"Spaces", summary:"share docs", featureSlug:"spaces" },                         createdAt: ++ts });
const A14 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset14", reason:"copyright", mediaId:"M14", severity:"medium" },              createdAt: ++ts });
const A15 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$15", userName:"Lee", invoiceId:"INV-15", currency:"USD" },                         createdAt: ++ts });
const A16 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Alex", time:"14:00" },                                                           createdAt: ++ts });
const A17 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$17", invoiceId:"INV-17", reason:"insufficient_funds" },                            createdAt: ++ts });
const A18 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip18", moderator:"Pat", mediaId:"M18", reviewId:"R18" },                      createdAt: ++ts });
const A19 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$19", userName:"Bee", invoiceId:"INV-19", currency:"USD" },                        createdAt: ++ts });
const A20 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$20", userName:"Kim", invoiceId:"INV-20", currency:"USD" },                         createdAt: ++ts });

// 21..40
const A21 = await NotificationsAccount.add({ userId, templateId:"twoFactorEnabled",           templateParams:{ userName:"Bee", method:"authenticator_app" },                                             createdAt: ++ts });
const A22 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$22", invoiceId:"INV-22", reason:"expired_card" },                                 createdAt: ++ts });
const A23 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset23", reason:"quality", mediaId:"M23", severity:"low" },                    createdAt: ++ts });
const A24 = await NotificationsAccount.add({ userId, templateId:"subscriptionRenewalReminder",templateParams:{ renewalDate:"2025-11-01", daysRemaining:"45" },                                          createdAt: ++ts });
const A25 = await NotificationsAccount.add({ userId, templateId:"systemMaintenance",          templateParams:{ startTime:"02:00", endTime:"03:30" },                                                     createdAt: ++ts });
const A26 = await NotificationsAccount.add({ userId, templateId:"accountWelcome",             templateParams:{ userName:"Jo", createdDate:"2025-08-20" },                                                createdAt: ++ts });
const A27 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$27", userName:"Bee", invoiceId:"INV-27", currency:"USD" },                        createdAt: ++ts });
const A28 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Jo", time:"08:00" },                                                             createdAt: ++ts });
const A29 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip29", moderator:"Sam", mediaId:"M29", reviewId:"R29" },                      createdAt: ++ts });
const A30 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$30", invoiceId:"INV-30", reason:"avs_mismatch" },                                  createdAt: ++ts });
const A31 = await NotificationsAccount.add({ userId, templateId:"adminAnnouncement",          templateParams:{ featureName:"Signals", summary:"alerts", featureSlug:"signals" },                           createdAt: ++ts });
const A32 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$32", userName:"Bee", invoiceId:"INV-32", currency:"USD" },                        createdAt: ++ts });
const A33 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset33", reason:"nudity", mediaId:"M33", severity:"high" },                    createdAt: ++ts });
const A34 = await NotificationsAccount.add({ userId, templateId:"twoFactorEnabled",           templateParams:{ userName:"Kai", method:"sms" },                                                            createdAt: ++ts });
const A35 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$35", invoiceId:"INV-35", reason:"do_not_honor" },                                  createdAt: ++ts });
const A36 = await NotificationsAccount.add({ userId, templateId:"accountWelcome",             templateParams:{ userName:"Max", createdDate:"2025-07-01" },                                                createdAt: ++ts });
const A37 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Max", time:"18:45" },                                                             createdAt: ++ts });
const A38 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$38", userName:"Bee", invoiceId:"INV-38", currency:"USD" },                        createdAt: ++ts });
const A39 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip39", moderator:"Jen", mediaId:"M39", reviewId:"R39" },                      createdAt: ++ts });
const A40 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$40", invoiceId:"INV-40", reason:"processing_error" },                               createdAt: ++ts });

// 41..60
const A41 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$41", userName:"Bee", invoiceId:"INV-41", currency:"USD" },                        createdAt: ++ts });
const A42 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$42", userName:"Bee", invoiceId:"INV-42", currency:"USD" },                        createdAt: ++ts });
const A43 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset43", reason:"spam", mediaId:"M43", severity:"low" },                       createdAt: ++ts });
const A44 = await NotificationsAccount.add({ userId, templateId:"subscriptionRenewalReminder",templateParams:{ renewalDate:"2025-12-01", daysRemaining:"75" },                                          createdAt: ++ts });
const A45 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Liz", time:"06:15" },                                                             createdAt: ++ts });
const A46 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$46", userName:"Bee", invoiceId:"INV-46", currency:"USD" },                        createdAt: ++ts });
const A47 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip47", moderator:"Pat", mediaId:"M47", reviewId:"R47" },                      createdAt: ++ts });
const A48 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$48", invoiceId:"INV-48", reason:"invalid_cvv" },                                   createdAt: ++ts });
const A49 = await NotificationsAccount.add({ userId, templateId:"accountWelcome",             templateParams:{ userName:"Liz", createdDate:"2025-06-15" },                                                createdAt: ++ts });
const A50 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$50", userName:"Kim", invoiceId:"INV-50", currency:"USD" },                         createdAt: ++ts });

// 51..70
const A51 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$51", userName:"Bee", invoiceId:"INV-51", currency:"USD" },                        createdAt: ++ts });
const A52 = await NotificationsAccount.add({ userId, templateId:"adminAnnouncement",          templateParams:{ featureName:"Bulk Ops", summary:"faster", featureSlug:"bulk-ops" },                         createdAt: ++ts });
const A53 = await NotificationsAccount.add({ userId, templateId:"systemMaintenance",          templateParams:{ startTime:"01:00", endTime:"01:30" },                                                       createdAt: ++ts });
const A54 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset54", reason:"malware", mediaId:"M54", severity:"high" },                  createdAt: ++ts });
const A55 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$55", invoiceId:"INV-55", reason:"generic_decline" },                               createdAt: ++ts });
const A56 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$56", userName:"Bee", invoiceId:"INV-56", currency:"USD" },                        createdAt: ++ts });
const A57 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Neo", time:"23:59" },                                                             createdAt: ++ts });
const A58 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip58", moderator:"Dan", mediaId:"M58", reviewId:"R58" },                      createdAt: ++ts });
const A59 = await NotificationsAccount.add({ userId, templateId:"subscriptionRenewalReminder",templateParams:{ renewalDate:"2026-01-01", daysRemaining:"100" },                                         createdAt: ++ts });
const A60 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$60", invoiceId:"INV-60", reason:"insufficient_funds" },                            createdAt: ++ts });

// 61..80
const A61 = await NotificationsAccount.add({ userId, templateId:"twoFactorEnabled",           templateParams:{ userName:"Bee", method:"security_key" },                                                   createdAt: ++ts });
const A62 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip62", moderator:"A", mediaId:"M62", reviewId:"R62" },                        createdAt: ++ts });
const A63 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$63", userName:"Bee", invoiceId:"INV-63", currency:"USD" },                        createdAt: ++ts });
const A64 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$64", invoiceId:"INV-64", reason:"issuer_unavailable" },                            createdAt: ++ts });
const A65 = await NotificationsAccount.add({ userId, templateId:"adminAnnouncement",          templateParams:{ featureName:"Rules", summary:"policies", featureSlug:"rules" },                             createdAt: ++ts });
const A66 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$66", userName:"Bee", invoiceId:"INV-66", currency:"USD" },                        createdAt: ++ts });
const A67 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Mia", time:"03:33" },                                                             createdAt: ++ts });
const A68 = await NotificationsAccount.add({ userId, templateId:"systemMaintenance",          templateParams:{ startTime:"04:00", endTime:"05:00" },                                                       createdAt: ++ts });
const A69 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$69", invoiceId:"INV-69", reason:"fraud_suspected" },                               createdAt: ++ts });
const A70 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset70", reason:"tos", mediaId:"M70", severity:"medium" },                     createdAt: ++ts });

// 71..90
const A71 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$71", userName:"Bee", invoiceId:"INV-71", currency:"USD" },                        createdAt: ++ts });
const A72 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip72", moderator:"B", mediaId:"M72", reviewId:"R72" },                        createdAt: ++ts });
const A73 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$73", invoiceId:"INV-73", reason:"issuer_declined" },                                createdAt: ++ts });
const A74 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Ivy", time:"12:12" },                                                             createdAt: ++ts });
const A75 = await NotificationsAccount.add({ userId, templateId:"twoFactorEnabled",           templateParams:{ userName:"Ivy", method:"email" },                                                           createdAt: ++ts });
const A76 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$76", userName:"Bee", invoiceId:"INV-76", currency:"USD" },                        createdAt: ++ts });
const A77 = await NotificationsAccount.add({ userId, templateId:"subscriptionRenewalReminder",templateParams:{ renewalDate:"2026-02-01", daysRemaining:"130" },                                         createdAt: ++ts });
const A78 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset78", reason:"pii", mediaId:"M78", severity:"high" },                      createdAt: ++ts });
const A79 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$79", invoiceId:"INV-79", reason:"velocity_limit" },                                createdAt: ++ts });
const A80 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$80", userName:"Bee", invoiceId:"INV-80", currency:"USD" },                        createdAt: ++ts });

// 81..100
const A81 = await NotificationsAccount.add({ userId, templateId:"accountWelcome",             templateParams:{ userName:"Zoe", createdDate:"2025-05-05" },                                                createdAt: ++ts });
const A82 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Zoe", time:"22:22" },                                                             createdAt: ++ts });
const A83 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$83", userName:"Bee", invoiceId:"INV-83", currency:"USD" },                        createdAt: ++ts });
const A84 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$84", invoiceId:"INV-84", reason:"timeout" },                                       createdAt: ++ts });
const A85 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip85", moderator:"C", mediaId:"M85", reviewId:"R85" },                        createdAt: ++ts });
const A86 = await NotificationsAccount.add({ userId, templateId:"systemMaintenance",          templateParams:{ startTime:"09:00", endTime:"10:00" },                                                       createdAt: ++ts });
const A87 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$87", userName:"Bee", invoiceId:"INV-87", currency:"USD" },                        createdAt: ++ts });
const A88 = await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset88", reason:"hate", mediaId:"M88", severity:"high" },                      createdAt: ++ts });
const A89 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$89", invoiceId:"INV-89", reason:"avs_mismatch" },                                   createdAt: ++ts });
const A90 = await NotificationsAccount.add({ userId, templateId:"twoFactorEnabled",           templateParams:{ userName:"Zoe", method:"app" },                                                             createdAt: ++ts });
const A91 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$91", userName:"Bee", invoiceId:"INV-91", currency:"USD" },                        createdAt: ++ts });
const A92 = await NotificationsAccount.add({ userId, templateId:"adminAnnouncement",          templateParams:{ featureName:"Flows", summary:"pipelines", featureSlug:"flows" },                            createdAt: ++ts });
const A93 = await NotificationsAccount.add({ userId, templateId:"subscriptionRenewalReminder",templateParams:{ renewalDate:"2026-03-01", daysRemaining:"160" },                                         createdAt: ++ts });
const A94 = await NotificationsAccount.add({ userId, templateId:"mediaApproved",              templateParams:{ mediaTitle:"Clip94", moderator:"D", mediaId:"M94", reviewId:"R94" },                        createdAt: ++ts });
const A95 = await NotificationsAccount.add({ userId, templateId:"paymentFailed",              templateParams:{ amount:"$95", invoiceId:"INV-95", reason:"stolen_card" },                                    createdAt: ++ts });
const A96 = await NotificationsAccount.add({ userId, templateId:"passwordChanged",            templateParams:{ userName:"Rae", time:"07:07" },                                                             createdAt: ++ts });
const A97 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$97", userName:"Bee", invoiceId:"INV-97", currency:"USD" },                        createdAt: ++ts });
const A98 = await NotificationsAccount.add({ userId, templateId:"systemMaintenance",          templateParams:{ startTime:"18:00", endTime:"19:00" },                                                       createdAt: ++ts });
const A99 = await NotificationsAccount.add({ userId, templateId:"paymentSucceeded",           templateParams:{ amount:"$99", userName:"Bee", invoiceId:"INV-99", currency:"USD" },                        createdAt: ++ts });
const A100= await NotificationsAccount.add({ userId, templateId:"mediaRejected",              templateParams:{ mediaTitle:"Asset100", reason:"violence", mediaId:"M100", severity:"high" },                createdAt: ++ts });

/* =========================
 * 3) GET examples (single query each)
 * ========================= */

// Category view "abc": pinned → UNREAD(pri DESC → newest DESC) → READ(pri DESC → newest DESC)
const resCategoryAbc = await NotificationsAccount.get(userId, { category: "abc", limit: 50 });
console.log("GET category=abc (pinned → unread by priority→newest → read by priority→newest)");
console.table(resCategoryAbc.items.map(n => ({
  id: n.notification_id, title: n.title, pinned: n.pinned ? 1 : 0, unread: !n.read ? 1 : 0, pri: n.priority, created_at: n.created_at
})));

// ALL view excluding pinned: UNREAD(pri DESC → newest DESC) → READ(pri DESC → newest DESC)
const resAll = await NotificationsAccount.get(userId, { limit: 50, excludePinnedInAll: true });
console.log("GET ALL (exclude pinned) (unread by priority→newest → read by priority→newest)");
console.table(resAll.items.map(n => ({
  id: n.notification_id, cat: n.category, pinned: n.pinned ? 1 : 0, unread: !n.read ? 1 : 0, pri: n.priority, created_at: n.created_at
})));

/* =========================
 * 4) LAST: flip three abc items to READ, then GET category=abc again
 * ========================= */
await NotificationsAccount.markRead(userId, A03.notification_id); // hg p2 → READ
await NotificationsAccount.markRead(userId, A04.notification_id); // gfd p10 → READ
await NotificationsAccount.markRead(userId, A05.notification_id); // hgfh p8 → READ

const resCategoryAbcAfter = await NotificationsAccount.get(userId, { category: "abc", limit: 50 });
console.log("GET category=abc AFTER markRead (pinned → unread → read)");
console.table(resCategoryAbcAfter.items.map(n => ({
  id: n.notification_id, title: n.title, pinned: n.pinned ? 1 : 0, unread: !n.read ? 1 : 0, pri: n.priority, created_at: n.created_at
})));