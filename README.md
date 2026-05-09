# Amazon IVS Real-time Studio

Browser-only live broadcasting on AWS — **no OBS, no third-party encoder**.
Built on:

- **Amazon IVS Real-time (Stages)** for the broadcaster (multi-host
  capable). The browser publishes camera + mic via the
  [Amazon IVS Web Broadcast SDK](https://aws.github.io/amazon-ivs-web-broadcast/).
- **Amazon IVS Channel + composition** to fan the stage out to a
  low-latency HLS playback URL.
- **`video.js` + the official Amazon IVS Tech**
  ([docs](https://docs.aws.amazon.com/ivs/latest/LowLatencyUserGuide/player-videojs.html))
  for every viewer.
- **Amazon SNS** (one topic per broadcast) + **DynamoDB** for
  notifications and state.
- **Vite + React + Tailwind** frontend, modular `utils/*` + `handlers/*`
  with a central event bus. Every button click dispatches a custom event
  and a handler reacts — no inline API calls in components.

> Reference: [`requirement/amazon-ivs-real-time-basic-web-demo-main`](requirement/amazon-ivs-real-time-basic-web-demo-main)
> (the AWS-samples real-time demo). This project mirrors its architecture but
> adds the studio features the brief asked for.

---

## Feature checklist

| # | Requirement | Where it lives |
|---|---|---|
| 1 | Broadcaster pause-feed button | `web/src/utils/ivsBroadcast.js` (`setPaused`) — mutes both `LocalStageStream`s |
| 2 | Mute mic + mute video buttons | `setMicMuted`, `setVideoMuted` (calls `LocalStageStream.setMuted`) |
| 3 | Snapchat-style overlay filters | `web/src/utils/filters.js` (canvas overlays — see *Limitations*) |
| 4 | Max-viewer cap | `server/services/viewerService.js` (`MAX_VIEWERS_REACHED` 403) |
| 5 | Optional payment gate | `server/services/paymentService.js` (DynamoDB-backed, mock + Stripe-ready) |
| 6 | Multi-broadcaster joint broadcast | Studio mints **co-host invite links** containing a participant token. Co-hosts open `/cohost/:id`, join the same Stage, and their video is mixed into the composition. Studio renders remote tiles via `STAGE_PARTICIPANT_STREAMS_ADDED` |
| 7 | Notification system | One **SNS topic per broadcast** (`createTopic`) + local SSE fan-out (`/api/broadcasts/:id/events`) |
| 8 | Total viewers from AWS | `IVS:GetStream.viewerCount` (see `server/services/ivsChannelService.js`) |
| 9 | Private session toggle + viewer notice | `setPrivate()` runs `StopComposition` + `StartComposition` with `EncoderConfigurationArn` to swap channels, then publishes `broadcast.private.on` → public viewers' overlay flips via SSE |
| 10 | Specific user can watch private | `IVSRT_PrivateAccess` allow-list table; viewer joins with `mode=private` and is denied (403 `PRIVATE_ACCESS_DENIED`) until the owner grants access |
| 11 | Poor-connection detection | `LocalStageStream.requestQualityStats()` polled every 4 s → `EV.CONNECTION_QUALITY` (NetworkQuality 1–4) |
| 12 | Internet cut-out detection | `web/src/utils/connection.js` (`online`/`offline` + `/healthz` probe) |
| – | Background switch (Meet-style) | `web/src/utils/background.js` (MediaPipe Selfie Segmentation, loaded from CDN) |
| – | Stream duration | `web/src/utils/duration.js` (anchored on IVS `startedAt`) |
| – | Owner authentication | One-time `ownerToken` issued at create, hash stored in DDB, `Authorization: Bearer …` enforced on `/start`, `/stop`, `/private`, `/private-access`, `/participant-token`, `/notifications/subscribe`, `DELETE` |
| – | Tailwind everywhere | `web/tailwind.config.js`, used in every page |
| – | Modular utility + handler files, button-clicks dispatch events | `web/src/utils/eventBus.js`, `web/src/handlers/*` |

---

## Repo layout (new code only)

```
server/                         Express backend + AWS SDK
├── aws/clients.js              IVS / IVSRealTime / DDB / SNS clients
├── config/tables.js            DynamoDB table-name config
├── services/
│   ├── broadcastService.js     orchestration (stage + 2 channels + SNS)
│   ├── ivsRealtimeService.js   Stages, tokens, compositions
│   ├── ivsChannelService.js    Channels + GetStream (viewer count, duration)
│   ├── snsService.js           CreateTopic / Subscribe / Publish + SSE bus
│   ├── viewerService.js        join / heartbeat / leave / private allow-list
│   ├── paymentService.js       payment-intent stub (Stripe-ready, mocked)
│   └── dynamoService.js        thin DDB wrapper
├── routes/                     /api/broadcasts/* endpoints
├── scripts/setup-dynamo.js     one-shot table creation
└── index.js                    Express entrypoint

web/                            Vite + React + Tailwind frontend
├── src/utils/                  Pure, framework-agnostic helpers
│   ├── eventBus.js             dispatch / listen (CustomEvent on EventTarget)
│   ├── events.js               EV.* event-name constants
│   ├── api.js                  REST wrapper
│   ├── ivsBroadcast.js         Web Broadcast SDK (Stages) helpers
│   ├── ivsPlayer.js            video.js + IVS tech
│   ├── background.js           MediaPipe background switch
│   ├── filters.js              Overlay filters
│   ├── connection.js           Online/offline + /healthz probe
│   ├── duration.js             Stream-duration ticker
│   └── sse.js                  SSE → event bus
├── src/handlers/               Translate UI events → side-effects
│   ├── broadcastHandlers.js
│   └── viewerHandlers.js
└── src/pages/                  Route components (HomePage, BroadcasterPage, ViewerPage)
```

The original test scripts (`test/`, `aws/`, `utils/`) are untouched so the
existing S3 / SQS / IVS unit tests still run.

---

## Setup

### 1. Configure AWS

Copy `.env.example` to `.env` and fill in keys for an account that has
permission for IVS, IVS Real-time, DynamoDB, and SNS.

```bash
cp .env.example .env
# edit .env
```

Required IAM actions (use the AWS managed policies or this list):

```
ivs:CreateChannel, ivs:GetChannel, ivs:DeleteChannel, ivs:GetStream,
ivs-realtime:CreateStage, ivs-realtime:DeleteStage,
ivs-realtime:CreateParticipantToken, ivs-realtime:StartComposition,
ivs-realtime:StopComposition, ivs-realtime:GetComposition,
ivs-realtime:ListParticipants, ivs-realtime:DisconnectParticipant,
sns:CreateTopic, sns:DeleteTopic, sns:Subscribe, sns:Unsubscribe,
sns:Publish, sns:ListSubscriptionsByTopic,
dynamodb:* on the four IVSRT_* tables
```

### 2. Install + create tables

```bash
npm install
npm run web:install
npm run db:setup:ivs        # creates IVSRT_Broadcasts / IVSRT_Viewers / etc.
```

### 3. Run the studio

```bash
npm run dev                  # boots :4000 (API) + :5173 (web)
# then open http://localhost:5173
```

You can also run them separately: `npm run server` and `npm run web`.

---

## End-to-end smoke test

Open three browser windows side-by-side:

1. **Broadcaster** (`http://localhost:5173`)
   - Create broadcast → studio loads at `/broadcast/:id`.
   - Click **Start camera**, then **Go live**.
2. **Public viewer** (incognito or another browser at `/watch/:id`)
   - Should see the live feed via Video.js + IVS tech.
3. **Private viewer** (`/watch/:id?mode=private`)
   - Will be denied until the broadcaster grants access (Studio → "Private
     access" panel).
4. In the studio, click **🔒 Go private**.
   - Public viewer instantly sees the **"Broadcaster is in a private session"**
     overlay (driven by SNS → SSE).
   - Private viewer keeps watching, with a **"Watching private session"**
     badge.
5. Click **🌍 Resume public** in the studio. Public viewer auto-resumes.

---

## What has been verified

The full backend pipeline has been **executed end-to-end against a live AWS
account** (`us-east-1`):

- `npm run db:setup:ivs` creates all 5 DynamoDB tables.
- `POST /api/broadcasts` provisions a Stage + 2 channels + SNS topic + DDB row
  (~4 s).
- `POST /:id/start` lazily creates a shared `EncoderConfiguration`, runs
  `StartComposition`, and persists the composition ARN.
- `POST /:id/private` flips the composition between the public and private
  channel and publishes a `broadcast.private.on` SNS notification that fans
  out to SSE subscribers.
- Owner-auth gate returns `401` without a bearer token and `200` with the
  token returned at create time.
- Payment-gate flow (intent → confirm → join) returns `402 PAYMENT_REQUIRED`
  unpaid and `200` once confirmed.
- `POST /:id/participant-token` returns a real Stages JWT that a co-host can
  use to join via `/cohost/:id?token=…`.
- `DELETE /:id` tears down all AWS resources and the DDB row.

What has **not** been verified from this environment (requires a real
browser + camera):

- A human actually publishing video into the Stage (the `web/` UI builds
  cleanly and all SDK imports resolve, but the camera flow itself has not
  been exercised).
- The `EV.CONNECTION_QUALITY` polling against a live publisher.
- The Meet-style background switch end-to-end (MediaPipe model loads from CDN).
- The 13–30 s lag when `StartComposition` swaps channels — see *Limitations*.

## Limitations & known gaps

- **Composition switch lag.** `StartComposition` typically takes 13–30 s to
  produce its first segment. Public viewers therefore see ~15 s of
  `ChannelNotBroadcasting` before their player resumes when the broadcaster
  toggles private→public. The "Broadcaster is in a private session" overlay
  hides this for them, but the experience is not the silky cross-fade some
  consumer apps offer. To remove the gap, keep both compositions running at
  all times (~2× cost) or have viewers consume the Stage directly with the
  Web Broadcast SDK (drops Video.js + IVS Tech).
- **"Snapchat-style" filters.** The current filter pipeline draws emoji
  overlays at fixed canvas positions. Real face-tracked stickers require a
  face-landmark model (face-api.js / MediaPipe FaceMesh) and have not been
  shipped yet.
- **Co-host invite links contain the token in the URL.** Acceptable for the
  demo; for production wrap with a one-shot signed redirect.
- **No global auth.** Anyone can call `POST /api/broadcasts` (create) and
  `GET /api/broadcasts` (list). Owner auth only protects mutations on a
  specific broadcast.
- **`createBroadcast` returns `ownerToken` only once.** Lose it and you must
  delete the broadcast manually using `node server/scripts/cleanup-orphan.js
  <id>`.

## Notes on the previous delivery

The earlier docs (now under `docs/legacy/`) referenced OBS Studio for the
broadcaster path. **Nothing in the new code uses OBS.** All publishing
happens through the IVS Web Broadcast SDK in the user's browser. The legacy
docs are kept only for historical reference.

The pre-existing tests under `test/` (S3, SQS, IVS unit tests, etc.) still
work and are still wired into the original `npm run test:*` scripts.
