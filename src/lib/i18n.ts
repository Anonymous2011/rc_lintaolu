import { cookies } from "next/headers";
import type { AttemptOutcome, ErrorKind, NotificationStatus } from "./types";

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "locale";

/**
 * Locale lives in a cookie rather than the URL.
 *
 * A `[locale]` route segment is the conventional Next.js answer, but it forces
 * every internal link to carry the locale and doubles the route surface. This
 * app's pages are already `force-dynamic` (they read live delivery state), so
 * reading a cookie costs nothing that was not already being paid. The trade-off
 * is that a language choice is not shareable via URL — acceptable for an
 * internal console, not acceptable for a public site.
 */
const en = {
  brand: "Notification relay",
  nav: { overview: "Overview", monitor: "Monitor", console: "Console" },
  langLabel: "Language",

  home: {
    title: "Notification relay",
    intro:
      "An internal service that accepts outbound HTTP notifications from business systems and takes ownership of delivering them to external vendor APIs — durably, with retries, and without the caller having to care about the outcome.",
    monitorCard: "Delivery monitor →",
    monitorCardDesc: "Accepted notifications, per-attempt history, and failure reasons.",
  },

  monitor: {
    bannerTitle: "This is a review surface, not production observability",
    bannerBody:
      "This page queries the service's SQLite tables directly so delivery behaviour can be inspected during review. In a real deployment the database stays the source of truth for delivery state, but it is the wrong query path for humans: operational insight belongs in structured logs shipped to a log store, metrics (delivery rate, attempt latency, retry depth, dead-letter growth) in Prometheus/Grafana, and alerting on dead-letter rate rather than a page someone remembers to open. The page also polls on an interval instead of streaming, for the same reason — it is a demonstration of the delivery model, not the monitoring system.",
    title: "Delivery monitor",
    subtitle:
      "Every notification the service has accepted, and every attempt made to deliver it.",

    filterAll: "All",
    filterFailing: "Failing",
    filterDead: "Dead-lettered",
    filterPending: "Pending",
    filterDelivered: "Delivered",

    empty: "No notifications yet.",
    emptyCta: "Send one from the console →",
    attemptsOf: (n: number, max: number) => `${n}/${max} attempts`,
    retryIn: (rel: string) => `retry ${rel}`,

    labelId: "ID",
    labelCreated: "Created",
    labelTarget: "Target",
    labelBody: "Body",

    noAttempts: "No attempts recorded yet — accepted and waiting for the first delivery.",
    noResponse: "no response",
    retryScheduled: (rel: string) => `retry scheduled ${rel}`,

    live: (s: number) => `Live · ${s}s`,
    paused: "Paused",
  },

  console: {
    title: "Test console",
    bannerTitle: "A review surface for making calls — a real one does not look like this",
    bannerBody:
      "This page stands in for a business system making the call from its own code. In production nobody fills in a form: the business system POSTs once to /api/notifications, with the parameters decided by its business logic and the credentials coming from its own configuration. The fields are editable here only so a reviewer can vary them and reach the different failure paths. The requests themselves are real, though — they are persisted, delivered by the same worker, retried under the same policy, and show up in the monitor.",
    subtitle:
      "Submit a real notification. It is persisted, delivered by the same worker as everything else, and appears in the monitor with its full attempt history.",
    mockNote:
      "Presets point at a bundled mock vendor that can be told to fail, rate-limit or stall, so retry behaviour is reproducible without depending on a third party.",

    examples: "Examples",
    presetAds: "Ad network conversion",
    presetAdsDesc: "Succeeds first try.",
    presetCrm: "CRM contact status",
    presetCrmDesc: "PUT with a patient policy.",
    presetInventory: "Inventory adjustment",
    presetInventoryDesc: "Fails twice with 503, then succeeds.",
    presetOutage: "Vendor down",
    presetOutageDesc: "Always 500 — exhausts retries and dead-letters.",
    presetBadrequest: "Malformed payload",
    presetBadrequestDesc: "400 — terminal, never retried.",
    presetRatelimit: "Rate limited",
    presetRatelimitDesc: "429 with Retry-After, honoured on the next attempt.",
    presetTimeout: "Slow vendor",
    presetTimeoutDesc: "Responds after our timeout expires.",
    presetSsrf: "Blocked target",
    presetSsrfDesc: "Cloud metadata IP — rejected at ingress.",

    request: "Request",
    fieldSource: "Source system",
    fieldEvent: "Event type",
    fieldMethod: "Method",
    fieldUrl: "Target URL",
    fieldHeaders: "Headers",
    fieldBody: "Body",
    fieldIdempotency: "Idempotency key",
    idempotencyHint: "Optional. Re-submitting the same key returns the original notification instead of enqueuing a second one.",
    addHeader: "Add header",
    removeHeader: "Remove",
    headerName: "Name",
    headerValue: "Value",

    delivery: "Delivery",
    fieldPolicy: "Retry policy",
    policyOnce: "single attempt, no retry",
    schedule: "Attempt schedule",
    scheduleHint: "Offsets from the first attempt, at the midpoint of each jitter window.",
    timeoutLabel: "Per-attempt timeout",

    send: "Send notification",
    sending: "Sending…",
    accepted: "Accepted — the service owns delivery from here.",
    duplicate: "Duplicate idempotency key — returned the original notification.",
    rejected: "Rejected",
    viewInMonitor: "View in monitor →",
    invalidJson: "Body is not valid JSON. It will be sent verbatim as text.",
  },

  overview: {
    heroTitle: "Design",
    heroNote:
      "Business systems need to call an external vendor's API when something important happens — tell the ad network about a signup, tell the CRM about a payment. The trouble is that those APIs time out, fail and rate-limit; if every business system handles that itself, the same retry logic gets written many times over. This service takes the job on: a business system tells us which address to call and what to send, we answer immediately, and from then on we keep trying until it lands. These three pages exist only so a person can see that happening — a real deployment needs no interface at all, because a business system just calls the API from its own code.",
    heroExampleLabel: "The whole of what a calling system does:",
    heroRequestLabel: "Request — sent by the business system",
    heroResponseLabel:
      "Response — returned immediately; all the caller needs to know is that the message was accepted by our system",

    boundaryTitle: "What this system does, and what it doesn't",
    boundaryBody:
      "In one sentence: it gets your notification delivered and does nothing else. The column on the right is the important one — refusing those jobs is what keeps this small enough to be dependable.",
    inScopeTitle: "We take care of",
    inScope: [
      { title: "Not losing it", why: "Written to the database before the caller gets a reply. A restart or a crash does not drop it." },
      { title: "Retrying automatically", why: "Failures are retried on their own, waiting a little longer each time so a struggling vendor is not hammered." },
      { title: "Telling failures apart", why: "Vendor is down: keep trying. Request itself is malformed: stop at once instead of hitting the same wall for hours." },
      { title: "Keeping what failed", why: "What truly cannot be delivered is set aside with its full history, for a person to look at." },
      { title: "Sending duplicates once", why: "Submit twice with the same idempotency key and only one call actually goes out." },
      { title: "One slow vendor staying its own problem", why: "There is a cap on how many slots one vendor can occupy at once, so notifications to everyone else keep moving." },
      { title: "Every attempt being inspectable", why: "When it was sent, what came back, and why it failed." },
    ],
    outScopeTitle: "We do not take care of",
    outScope: [
      { title: "Reading the vendor's reply", why: "The brief says business systems do not care about the return value. We check the status code and throw the rest away. Not doing this is exactly what keeps the service simple enough to be reliable." },
      { title: "Building the request for you", why: "Address, headers and body arrive ready to send. If we stored each vendor's format, every field a vendor changes would mean editing and redeploying this service — while the business system knew the right format all along." },
      { title: "Holding vendor credentials", why: "Callers send their own auth headers. The weakest of these decisions: rotating one key should not mean editing five systems, so it is the first thing worth changing." },
      { title: "Guaranteeing order", why: "Retrying reshuffles things by nature — something that fails twice arrives after something sent later. If order matters, the business system has to handle it." },
      { title: "Scheduling for later", why: "We send now and keep trying until it gets through. 'Send this at 3pm' is a different job." },
      { title: "Deciding who should hear about an event", why: "One request, one address. Notifying two vendors means sending twice; working out who cares belongs in another system." },
      { title: "Login and permissions", why: "An internal service called only by internal systems. A shared token at most." },
      { title: "Retrying forever", why: "If a vendor is unreachable for days we give up and leave a record. Retrying forever grows a backlog and disguises 'this vendor is gone for good' as 'still working on it'." },
    ],

    archTitle: "Architecture",
    archBody:
      "A business system sends a ready-made request, we write it to the database, and we answer 202. That write is the moment responsibility transfers — after it, the caller can crash without the notification being lost. A worker runs in the background, checking the database every half second, taking out whatever is due, sending it to the vendor and deciding what happens to it next. The monitor page reads the same data.",

    archLabels: {
      business: "Business systems",
      sys1: "signup-service",
      sys2: "billing-service",
      sys3: "order-service",
      accept: "POST /api/notifications",
      acceptSub: "202 immediately",
      relay: "This service",
      ingress: "Intake",
      ingressSub: "check · dedupe · store",
      persist: "store before replying",
      queue: "Database (also the queue)",
      queueSub: "notifications + attempts",
      claim: "take what is due",
      worker: "Delivery worker",
      workerSub: "send · judge · decide next",
      retry: "try again later",
      deliver: "HTTP",
      vendors: "Vendor APIs",
      vendor1: "Ad network",
      vendor2: "CRM",
      vendor3: "Inventory",
      monitor: "Monitor",
      read: "reads",
    },

    storageTitle: "Why a database instead of a message queue",
    storageBody:
      "The word queue makes people reach for Kafka or RabbitMQ. Neither is here, because everything a delivery queue needs is already in an ordinary table.",
    storage: [
      { title: "A database is enough", why: "Data survives, transactions work, and one statement can safely take a job. 'What is due now' is a single SQL query. Nothing to operate, nothing extra to deploy — clone the repo and run it." },
      { title: "Speed is not the problem", why: "Measured on a dev machine: about 15,900 enqueues per second, about 5,700 notifications per second through their full three writes, and 0.089ms to pick 50 due rows out of a million waiting. Actual delivery runs at tens per second, limited by the in-flight cap and vendor response times. The bottleneck is two orders of magnitude away, and it is that constant rather than the database." },
      { title: "A broker's costs are certain", why: "Another component to run, another deployment, another class of failure to debug. The reliability it would buy is already here." },
      { title: "And it saves none of the real work", why: "Even with a broker, the retry intervals, the retryable/terminal decision and what to do after final failure all still have to be written. That is where the actual difficulty lives." },
      { title: "When to switch", why: "The wall is 'only one process may write', not the design. Move to Postgres and run several workers against a schema that barely changes. A real broker earns its place once there is cross-region delivery or one message must reach many parties." },
    ],

    glossaryTitle: "Terminology",
    glossaryBody:
      "Every label in the UI maps to a value in the database. The monospace name beside each term is how it is written in the data and in log lines, so the page and the data use one vocabulary.",
    glossaryStatesTitle: "States a notification can be in",
    glossaryStates: [
      { term: "Waiting", code: "pending", def: "Accepted and stored, waiting for its next attempt. Covers both never-tried-yet and between-retries." },
      { term: "Sending", code: "in_flight", def: "A request is in flight. It cannot stay here: if the process dies, the hold expires and it returns to waiting." },
      { term: "Delivered", code: "delivered", def: "The vendor answered 2xx, meaning the request was accepted. Not that the vendor's own logic succeeded — we only read the status code." },
      { term: "Failed for good", code: "dead", def: "No more retries: either an error that repeating cannot fix, or attempts used up. Kept with its full history for a person to look at." },
      { term: "Failing", code: "(a filter, not a state)", def: "A monitor filter covering both what has failed for good and what is still retrying after at least one failure. 'What is going wrong right now' cannot be answered by any single state." },
    ],
    glossaryMechanismsTitle: "A few mechanisms",
    glossaryMechanisms: [
      { term: "Attempt", code: "attempts", def: "One HTTP call. A notification can have many, each recording its own status code, duration and failure reason. The sequence usually tells you more than the final result." },
      { term: "At-least-once", code: "—", def: "What we promise: never quietly lost, but possibly sent twice. The duplicate case is real — a crash after the request went out but before the answer came back produces one." },
      { term: "Worth retrying / not worth retrying", code: "outcome", def: "The judgement made about each failure. The first means 'probably temporary, another go might work'; the second means 'a hundred more tries give the same error'." },
      { term: "Growing intervals with random jitter", code: "next_attempt_at", def: "Each retry waits longer than the last, and the wait wobbles randomly. Without the wobble, everything queued during an outage hits the vendor the instant it recovers and knocks it over again." },
      { term: "Idempotency key", code: "idempotency_key", def: "A string the caller invents to say 'this is the same event'. Submit twice with it and we return the original instead of sending again. It protects against the caller's own retries." },
      { term: "Retry-After", code: "http_429", def: "The header a rate-limiting vendor uses to say when to come back. It wins over our own timing, up to a cap." },
    ],

    classifyTitle: "What gets retried, what gets dropped",
    classifyBody:
      "This is the core judgement the system makes. Wrong in one direction and you spend hours hammering a vendor that will never accept the request; wrong in the other and you drop a notification that would have worked on the second try.",
    classifyCols: { signal: "Situation", decision: "What we do", why: "Why" },
    classifyRetry: "retry",
    classifyStop: "drop",
    classifyRows: [
      { signal: "2xx", retry: false, why: "It worked. Done." },
      { signal: "5xx", retry: true, why: "The vendor is having trouble of its own, most likely temporary." },
      { signal: "429", retry: true, why: "Rate limited. If it says when to come back we listen — capped, so one header cannot park a notification for a week." },
      { signal: "408 · timeout", retry: true, why: "We cannot tell whether it landed. We try again and let the vendor deduplicate." },
      { signal: "connection · DNS failure", retry: true, why: "A network-level problem, usually temporary." },
      { signal: "other 4xx", retry: false, why: "Our request is wrong. Trying again gives the identical error and hides a problem only a person can fix." },
      { signal: "3xx", retry: false, why: "A notification endpoint should not redirect. Following one could send the content to an address we never checked." },
      { signal: "blocked target", retry: false, why: "The address points inside the internal network. That is a permanent decision, not a passing failure." },
    ],

    policyTitle: "Retry policies",
    policyBody:
      "A policy decides how many times to try and how long to wait between goes. Callers pick one of the four below rather than filling in numbers — choosing patient states an intent, passing a 1ms interval states a mistake. Every figure in the table is computed from the policy definition.",
    policyCols: {
      name: "Policy",
      attempts: "Tries",
      span: "Gives up after",
      timeout: "Per-attempt timeout",
      use: "Use when",
    },
    policyUse: {
      standard: "Default, for short-lived trouble",
      patient: "Losing it is worse than it being late — payments, signups",
      fast: "Worthless if it arrives late",
      once: "One shot; the caller handles failure",
    },

    codeTitle: "Tables and retry policies",
    codeBody:
      "Read from the source files as the page renders, not pasted in.",
    codeSchemaTitle: "Two tables",
    codeSchemaNotifications:
      "One row per notification, recording where it has got to. The retry policy is fixed onto the row when we accept it — editing a policy definition later does not change notifications already taken on.",
    codeSchemaAttempts:
      "One row per request sent. This is the only place that can answer why something failed: a notification may be tried many times, and the valuable part is the sequence (503, 503, 201), which a single table cannot keep.",
  },

  status: {
    delivered: "Delivered",
    dead: "Dead",
    pending: "Pending",
    in_flight: "In flight",
  } satisfies Record<NotificationStatus, string>,

  outcome: {
    success: "success",
    retryable: "retryable",
    terminal: "terminal",
  } satisfies Record<AttemptOutcome, string>,

  errorKind: {
    http_5xx: "Vendor 5xx",
    http_429: "Rate limited (429)",
    http_408: "Vendor timeout (408)",
    http_4xx: "Rejected 4xx",
    http_3xx: "Unexpected redirect",
    timeout: "Request timed out",
    connection: "Connection failed",
    invalid_url: "Invalid target URL",
    blocked_host: "Blocked by SSRF guard",
  } satisfies Record<ErrorKind, string>,
};

/**
 * Typed against the English dictionary, so a missing or misspelled key is a
 * compile error rather than a blank string discovered by a reviewer.
 */
const zh: typeof en = {
  brand: "通知投递服务",
  nav: { overview: "概览", monitor: "投递监控", console: "测试控制台" },
  langLabel: "语言",

  home: {
    title: "通知投递服务",
    intro:
      "一个内部服务：接收各业务系统提交的对外 HTTP 通知请求，并接管后续的投递责任——持久化、自动重试，让调用方不必再关心投递结果。",
    monitorCard: "投递监控 →",
    monitorCardDesc: "已接收的通知、每一次投递尝试的历史，以及失败原因。",
  },

  monitor: {
    bannerTitle: "这是评审用的观察界面，不是生产级监控系统",
    bannerBody:
      "本页直接查询服务的 SQLite 表，以便在评审时观察投递行为。在真实部署中，数据库仍然是投递状态的事实来源，但它不应该成为人查询的入口：运维观测应当由结构化日志（汇聚到日志系统）、指标（投递成功率、尝试耗时、重试堆积、死信增长，进入 Prometheus/Grafana）以及基于死信率的告警来承担，而不是依赖某个人记得打开这个页面。页面的自动刷新同样是轮询而非推送，原因相同——它演示的是投递模型，而不是监控系统本身。",
    title: "投递监控",
    subtitle: "服务已接收的每一条通知，以及为投递它所做的每一次尝试。",

    filterAll: "全部",
    filterFailing: "异常中",
    filterDead: "死信",
    filterPending: "待投递",
    filterDelivered: "已送达",

    empty: "暂无通知。",
    emptyCta: "去测试控制台发送一条 →",
    attemptsOf: (n: number, max: number) => `${n}/${max} 次尝试`,
    retryIn: (rel: string) => `${rel}重试`,

    labelId: "ID",
    labelCreated: "创建时间",
    labelTarget: "目标",
    labelBody: "请求体",

    noAttempts: "尚未发起投递——已接收，等待第一次尝试。",
    noResponse: "无响应",
    retryScheduled: (rel: string) => `已安排${rel}重试`,

    live: (s: number) => `实时 · ${s}秒`,
    paused: "已暂停",
  },

  console: {
    title: "测试控制台",
    bannerTitle: "这是评审用的调用界面，真实调用不长这样",
    bannerBody:
      "这个页面替代的是「某个业务系统在自己的代码里发起一次调用」。生产环境里没有人会填表单——业务系统在自己的服务里 POST 一次 /api/notifications 就结束了，参数由它的业务逻辑决定，认证信息来自它自己的配置。这里做成可编辑的输入框，只是为了让评审者能改参数、试出不同的失败路径。但发出去的请求是真实的：会落库、由同一个 worker 投递、按同样的策略重试，并出现在监控页里。",
    subtitle:
      "提交一条真实的通知。它会被持久化，由与其他通知相同的 worker 投递，并带着完整的尝试历史出现在监控页中。",
    mockNote:
      "示例指向内置的模拟供应商接口，可以让它失败、限流或拖延响应，从而在不依赖第三方的情况下复现重试行为。",

    examples: "示例",
    presetAds: "广告平台转化回传",
    presetAdsDesc: "首次尝试即成功。",
    presetCrm: "CRM 联系人状态",
    presetCrmDesc: "PUT 请求，使用 patient 策略。",
    presetInventory: "库存变更",
    presetInventoryDesc: "先两次 503 失败，随后成功。",
    presetOutage: "供应商宕机",
    presetOutageDesc: "持续 500——重试耗尽后进入死信。",
    presetBadrequest: "请求体不合法",
    presetBadrequestDesc: "400——终止，不再重试。",
    presetRatelimit: "被限流",
    presetRatelimitDesc: "429 并带 Retry-After，下次尝试会遵守。",
    presetTimeout: "供应商响应缓慢",
    presetTimeoutDesc: "在我们的超时时间之后才返回。",
    presetSsrf: "被拦截的目标",
    presetSsrfDesc: "云元数据地址——在入口即被拒绝。",

    request: "请求",
    fieldSource: "来源系统",
    fieldEvent: "事件类型",
    fieldMethod: "方法",
    fieldUrl: "目标地址",
    fieldHeaders: "请求头",
    fieldBody: "请求体",
    fieldIdempotency: "幂等键",
    idempotencyHint: "可选。使用相同的幂等键重复提交时，会返回原有通知，而不会再次入队。",
    addHeader: "添加请求头",
    removeHeader: "删除",
    headerName: "名称",
    headerValue: "值",

    delivery: "投递",
    fieldPolicy: "重试策略",
    policyOnce: "只尝试一次，不重试",
    schedule: "尝试计划",
    scheduleHint: "相对首次尝试的时间偏移，取每次抖动区间的中点。",
    timeoutLabel: "单次尝试超时",

    send: "发送通知",
    sending: "发送中…",
    accepted: "已接收——从这一刻起由服务负责投递。",
    duplicate: "幂等键重复——返回了原有的通知。",
    rejected: "被拒绝",
    viewInMonitor: "在监控页查看 →",
    invalidJson: "请求体不是合法 JSON，将按纯文本原样发送。",
  },

  overview: {
    heroTitle: "设计说明",
    heroNote:
      "公司里的业务系统在关键事件发生时，需要去调用外部供应商的接口——注册成功后通知广告平台、付款成功后通知 CRM。问题是这些外部接口随时可能超时、报错、被限流；如果每个业务系统各自处理，就要把重试逻辑写很多遍。本服务把这件事接管过来：业务系统只管告诉我们「要调哪个地址、带什么内容」，我们立刻回复「收到了」，然后负责一直重试直到送达。这三个页面只是为了让人能看见它在做什么——真实系统里不需要界面，业务系统在自己的代码里调一次接口就结束了。",
    heroExampleLabel: "业务系统要做的全部事情：",
    heroRequestLabel: "请求 —— 业务系统发出",
    heroResponseLabel: "响应 —— 立即返回，上游只需要知道消息被我们的系统成功接收",

    boundaryTitle: "这个系统做什么，不做什么",
    boundaryBody:
      "一句话：它负责把你的通知送出去，除此之外什么都不做。真正重要的其实是右边那一列——正是因为拒绝了那些事，它才小到足以让人放心。",
    inScopeTitle: "我们负责",
    inScope: [
      { title: "不会丢", why: "先写进数据库，再回复调用方。服务重启或崩溃，通知都还在。" },
      { title: "自动重试", why: "失败后自动再试，每次间隔更长一点，不会把本来就吃力的供应商压垮。" },
      { title: "分得清失败类型", why: "对方挂了就继续试；请求本身写错了就立刻停，不用几个小时反复撞同一堵墙。" },
      { title: "失败留档", why: "实在送不出去的单独存起来，连同每一次尝试的记录，留给人处理。" },
      { title: "重复提交只发一次", why: "调用方带同一个幂等键提交两次，我们只会真的发出去一次。" },
      { title: "一家慢不拖累其他", why: "单个供应商能同时占用的通道有上限，不会影响发往别家的通知。" },
      { title: "每次尝试都查得到", why: "什么时候发的、对方回了什么、为什么失败。" },
    ],
    outScopeTitle: "我们不负责",
    outScope: [
      { title: "解析供应商的回复内容", why: "需求里写明业务系统不关心返回值。我们只看状态码判断成没成功，回复内容直接丢弃。正因为不做这件事，服务才简单到足够可靠。" },
      { title: "帮调用方拼请求", why: "地址、请求头、内容都是拼好了送过来的。如果由我们存每家供应商的格式，那供应商每改一个字段，都要改这个服务并重新发布——而业务系统本来就知道该怎么发。" },
      { title: "保管供应商的密钥", why: "认证信息由调用方自己带在请求里。这是这些决定里最站不住脚的一条：换一个密钥不该意味着要改五个系统，所以它也是最先该改的。" },
      { title: "保证先后顺序", why: "重试本身就会打乱顺序——失败两次的通知会落在更晚发出的那条后面。如果顺序很重要，得由业务系统自己保证。" },
      { title: "定时发送", why: "我们做的是「现在就发，直到发出去为止」，不是「下午三点再发」。" },
      { title: "决定一条消息该发给谁", why: "一次请求对应一个地址。要通知两家供应商就发两次；谁该收到什么消息，是另一个系统要解决的问题。" },
      { title: "无限重试", why: "对方连着几天不通，我们会放弃并留档。一直重试只会让积压越堆越多，还会把「对方永久下线」这种需要人介入的问题，伪装成「正在处理中」。" },
    ],

    archTitle: "整体架构",
    archBody:
      "业务系统把拼好的请求发过来，我们先存进数据库，再回复 202。这次写入就是责任转移的时刻——在此之后，业务系统即使崩溃，通知也不会丢。后台有一个一直在跑的 worker，每隔半秒查一次数据库，把到时间的通知取出来发给供应商，再根据结果决定它接下来怎么办。监控页读的就是同一批数据。",

    archLabels: {
      business: "业务系统",
      sys1: "注册服务",
      sys2: "计费服务",
      sys3: "订单服务",
      accept: "POST /api/notifications",
      acceptSub: "立即返回 202",
      relay: "本服务",
      ingress: "接入接口",
      ingressSub: "检查 · 去重 · 存下来",
      persist: "先存好再回复",
      queue: "数据库（也是队列）",
      queueSub: "通知 + 每次尝试",
      claim: "取出到期的",
      worker: "投递 Worker",
      workerSub: "发请求 · 判断结果 · 决定下一步",
      retry: "过一会儿再试",
      deliver: "HTTP",
      vendors: "供应商接口",
      vendor1: "广告平台",
      vendor2: "CRM",
      vendor3: "库存系统",
      monitor: "监控页",
      read: "读取",
    },

    storageTitle: "为什么用数据库，而不是消息队列",
    storageBody:
      "很多人看到「队列」就会想到 Kafka 或 RabbitMQ。这里没有用，原因是：投递队列需要的能力，一张普通的表已经全都有了。",
    storage: [
      { title: "数据库够用", why: "数据存得住、支持事务、能用一条语句安全地把任务领走。「谁到期该发了」就是一句 SQL 查询。零运维、零额外部署，clone 下来就能跑。" },
      { title: "性能不是问题", why: "开发机上实测：入队约每秒 15,900 次，一条通知完整走完（3 次写）约每秒 5,700 条，100 万条待投递时取 50 条只要 0.089 毫秒。而系统实际投递速度是每秒几十条——受限于同时在飞的请求数上限和供应商的响应时间。瓶颈差了两个数量级，卡住的是那个常量，不是数据库。" },
      { title: "上消息队列的代价是确定的", why: "多一个要运维的组件、多一套部署、多一类要排查的故障。而它能买到的可靠性，这里已经有了。" },
      { title: "而且省不掉真正的工作量", why: "就算上了消息队列，重试间隔怎么算、哪种失败该重试、彻底失败后怎么办——这些逻辑一行都省不掉。那才是这个系统真正的难点。" },
      { title: "什么时候该换", why: "撑不住的是「只能一个进程写」这个限制，不是这套设计。量大了就换成 Postgres、多开几个 worker，表结构几乎不用动。真正需要消息队列，要等到跨机房投递或者一条消息要发给很多方。" },
    ],

    glossaryTitle: "术语说明",
    glossaryBody:
      "界面上的每个词都对应数据库里的一个值。旁边的等宽字体就是它在数据库和日志里的写法，这样看页面和查数据用的是同一套词。",
    glossaryStatesTitle: "一条通知可能处在的状态",
    glossaryStates: [
      { term: "待投递", code: "pending", def: "已经收下并存好，等着下一次尝试。既包括「还没试过」，也包括「正处在两次重试之间」。" },
      { term: "投递中", code: "in_flight", def: "正在给供应商发请求。不会一直停在这里：进程要是崩了，占用过期后它会回到待投递。" },
      { term: "已送达", code: "delivered", def: "供应商返回了 2xx，表示请求被收下了。注意这不代表对方的业务真的处理成功——我们只看状态码。" },
      { term: "彻底失败", code: "dead", def: "不再重试了：要么是那种再试也没用的错误，要么是次数已经用完。连同完整记录保留下来，等人来看。" },
      { term: "异常中", code: "（筛选条件，不是状态）", def: "监控页上的一个筛选项，同时包含「已经彻底失败的」和「还在重试但已经失败过的」。「现在哪里不对劲」这个问题，只看某一个状态是答不上来的。" },
    ],
    glossaryMechanismsTitle: "几个机制",
    glossaryMechanisms: [
      { term: "尝试", code: "attempts", def: "一次 HTTP 调用。一条通知可以有很多次，每次都单独记下状态码、耗时和失败原因。看那一串过程，往往比看最终结果更有用。" },
      { term: "至少一次", code: "—", def: "我们的承诺：绝不悄悄丢掉，但可能重复发。重复不是理论上的可能——请求已经发出、响应还没回来时崩溃，就会产生一次。" },
      { term: "值得再试 / 不值得再试", code: "outcome", def: "对每次失败的判断。前者意思是「大概率是暂时的，再来一次可能就好了」，后者意思是「再试一百次也是同样的错」。" },
      { term: "间隔递增与随机浮动", code: "next_attempt_at", def: "每次重试都比上次等得更久。等待时间还会随机浮动一点，否则供应商一恢复，积压的通知会在同一瞬间全部涌过去，把它再压垮一次。" },
      { term: "幂等键", code: "idempotency_key", def: "调用方自己起的一个字符串，用来标识「这是同一件事」。用同一个键提交两次，我们返回原来那条，不会再发一次。它防的是调用方自己的重试。" },
      { term: "Retry-After", code: "http_429", def: "被限流时，供应商用这个响应头告诉我们什么时候再来。它比我们自己算的时间优先，但设有上限。" },
    ],

    classifyTitle: "什么该重试，什么该放弃",
    classifyBody:
      "这是这个系统最核心的判断。判断错一个方向，会用几个小时反复轰炸一个永远不会接受这个请求的供应商；错另一个方向，会丢掉一条本来第二次就能成功的通知。",
    classifyCols: { signal: "情况", decision: "怎么办", why: "为什么" },
    classifyRetry: "重试",
    classifyStop: "放弃",
    classifyRows: [
      { signal: "2xx", retry: false, why: "成功了，结束。" },
      { signal: "5xx", retry: true, why: "对方自己出问题了，多半是暂时的。" },
      { signal: "429", retry: true, why: "被限流。对方说了多久后再来，就听它的（但设上限，免得一个响应头把通知压住一星期）。" },
      { signal: "408 · 超时", retry: true, why: "不知道到底送到没有。我们仍然再试一次，由供应商那边去重。" },
      { signal: "连不上 · 域名解析失败", retry: true, why: "网络层的问题，通常是暂时的。" },
      { signal: "其他 4xx", retry: false, why: "是我们的请求写错了。再试只会得到一模一样的错误，还会把一个只有人能修的问题盖住。" },
      { signal: "3xx", retry: false, why: "通知接口不该做跳转。跟着跳过去，有可能把内容发到一个我们从没检查过的地址。" },
      { signal: "目标地址被拦截", retry: false, why: "地址指向内网。这是个永久性的判断，不是一次暂时的失败。" },
    ],

    policyTitle: "重试策略",
    policyBody:
      "策略决定「试几次、每次隔多久」。调用方只能从下面四个里选一个，不能自己随便填数字——选 patient 表达的是意图，填一个 1 毫秒的间隔表达的则是失误。表里的数字都是从策略定义算出来的。",
    policyCols: {
      name: "策略",
      attempts: "试几次",
      span: "多久后放弃",
      timeout: "单次超时",
      use: "什么时候用",
    },
    policyUse: {
      standard: "默认，应对短暂故障",
      patient: "丢了比晚到更糟，比如付款、注册",
      fast: "迟到就没意义的通知",
      once: "只发一次，失败自己处理",
    },

    codeTitle: "表结构",
    codeBody:
      "这些片段是渲染时直接从源文件读出来的。",
    codeSchemaTitle: "两张表",
    codeSchemaNotifications:
      "一条通知一行，记录它现在到哪一步了。重试策略在收下时就固定到这行上——之后改策略定义，不影响已经收下的通知。",
    codeSchemaAttempts:
      "每发一次请求记一行。「为什么失败」只能从这里回答：一条通知可能试很多次，有价值的恰恰是那一串过程（503、503、201），单表只留得下最后一次。",
  },

  status: {
    delivered: "已送达",
    dead: "死信",
    pending: "待投递",
    in_flight: "投递中",
  },

  outcome: {
    success: "成功",
    retryable: "可重试",
    terminal: "终止",
  },

  errorKind: {
    http_5xx: "供应商 5xx",
    http_429: "被限流 (429)",
    http_408: "供应商超时 (408)",
    http_4xx: "请求被拒绝 4xx",
    http_3xx: "意外重定向",
    timeout: "请求超时",
    connection: "连接失败",
    invalid_url: "目标地址非法",
    blocked_host: "被 SSRF 防护拦截",
  },
};

export type Dictionary = typeof en;

const DICTIONARIES: Record<Locale, Dictionary> = { en, zh };

function isLocale(v: string | undefined): v is Locale {
  return LOCALES.includes(v as Locale);
}

/** Chinese is the default; the cookie only ever records a deliberate switch. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "zh";
}

export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}
