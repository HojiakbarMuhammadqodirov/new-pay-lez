/**
 * The assistant's model path, end to end, against a **scripted fake Claude**.
 *
 * `ports/llm.ts` talks to whatever `CONFIG.llm.baseUrl` names, so this file
 * stands up a `node:http` server on a free port that answers `POST /v1/messages`
 * from a script — "first a tool call, then this sentence" — and records every
 * request it was sent. Nothing here reaches the network, and no key exists:
 * the fake checks that one was sent, not what it is.
 *
 * What it proves, in the order the brief listed them:
 *
 * - a tool loop answers, and the request is the documented shape (cached
 *   system block, tools, the assistant's content echoed back unchanged with its
 *   thinking block, every tool result in one user message);
 * - a model failure — an HTTP error, a timeout, a refusal, a body that is not
 *   JSON — is the deterministic answer, never an error, and is logged in one
 *   line that carries neither the question nor the key;
 * - a figure the data does not have is sent back once, and a second miss is
 *   the deterministic answer;
 * - a tool cannot be pointed at another user, and the partner side cannot be
 *   pointed at another venue — the model is never even called for one;
 * - the response keeps the shape both clients already read.
 *
 * Its own module, like `verify-nfc.ts`: `verify.ts` runs it with its harness,
 * and it runs alone too — `node server/verify-assistant.ts`.
 */
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { pathToFileURL } from 'node:url';
import { CONFIG } from './config.ts';
import { openDb } from './db/db.ts';
import { allRoutes } from './http/routes/index.ts';
import { createApi } from './http/server.ts';
import * as accounts from './domain/accounts.ts';
import * as assistant from './domain/assistant.ts';
import * as ledger from './domain/ledger.ts';
import { consumerTools, partnerTools, stripHtml } from './domain/assistantTools.ts';
import { systemFor } from './domain/assistantPrompt.ts';
import { DomainError } from './domain/errors.ts';
import { newId } from './domain/ids.ts';
import { seedPlatform } from './domain/settings.ts';
import { localMonth, now } from './domain/time.ts';
import * as llm from './ports/llm.ts';

export interface Harness {
  describe: (name: string) => void;
  check: (what: string, condition: boolean, detail?: unknown) => void;
  eq: (what: string, actual: unknown, expected: unknown) => void;
}

const SECRET = 'verify-assistant-secret';
const VENUE_TZ = 'Europe/Warsaw';
const KEY = 'sk-ant-verify-not-a-real-key';

/* ═══════════════════════════════════════════════════════ the fake endpoint ══ */

type Body = Record<string, any>;
interface Seen {
  body: Body;
  headers: IncomingHttpHeaders;
}
interface Scripted {
  status?: number;
  /** A body to send as JSON, or a raw string to send as it is. */
  body: unknown;
  delayMs?: number;
}
type Script = (request: Body, index: number) => Scripted;

async function fakeClaude() {
  const seen: Seen[] = [];
  let script: Script = () => ({ body: say('ok') });
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw) as Body;
    seen.push({ body, headers: req.headers });
    const reply = script(body, seen.length - 1);
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    if (res.destroyed) return;
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
    res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    seen,
    play(next: Script) {
      seen.length = 0;
      script = next;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A final answer, as the Messages API returns one. */
const say = (text: string): Body => ({
  id: 'msg_fake',
  type: 'message',
  role: 'assistant',
  model: CONFIG.llm.model,
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 10 },
});

/** A turn that stops for tools — with a thinking block, which must come back unchanged. */
const callTools = (...calls: Array<{ name: string; input?: Record<string, unknown> }>): Body => ({
  id: 'msg_fake_tools',
  type: 'message',
  role: 'assistant',
  model: CONFIG.llm.model,
  content: [
    { type: 'thinking', thinking: '', signature: 'fake-signature-xyz' },
    ...calls.map((call, index) => ({ type: 'tool_use', id: `toolu_${index}`, name: call.name, input: call.input ?? {} })),
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 10, output_tokens: 10 },
});

/** The last user message's tool results, by tool_use id. */
const toolResults = (request: Body): Array<{ tool_use_id: string; content: string; is_error?: boolean }> => {
  const last = request.messages[request.messages.length - 1];
  return Array.isArray(last?.content) ? last.content.filter((block: Body) => block.type === 'tool_result') : [];
};

/* ═══════════════════════════════════════════════════════════════ the world ══ */

async function world() {
  const db = await openDb(':memory:');
  await seedPlatform(db);
  const at = now();
  const customer = await accounts.signUp(db, { email: 'ask-me@verify.test', password: 'hunter22', name: 'Asker One', at, acceptTerms: true });
  const other = await accounts.signUp(db, { email: 'ask-other@verify.test', password: 'hunter22', name: 'Other Person', at, acceptTerms: true });
  const owner = await accounts.signUp(db, { email: 'ask-owner@verify.test', password: 'hunter22', name: 'Owner Two', at, acceptTerms: true });
  const rival = await accounts.signUp(db, { email: 'ask-rival@verify.test', password: 'hunter22', name: 'Rival Three', at, acceptTerms: true });
  await db.run(`UPDATE users SET city = 'Krakow' WHERE id IN ($a, $b)`, { a: customer.id, b: other.id });

  const venueId = newId('ven');
  const rivalVenueId = newId('ven');
  await db.tx(async () => {
    for (const [userId] of [[owner.id], [rival.id]]) {
      await db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'partner_owner', $t)`, { u: userId, t: at });
    }
    for (const [id, ownerId, name] of [
      [venueId, owner.id, 'Verify Kebab House'],
      [rivalVenueId, rival.id, 'Rival Bistro'],
    ]) {
      await db.run(
        `INSERT INTO venues (id, owner_user_id, name, category, subcategory, city, country_code, timezone, currency,
                             status, verified_at, amount_entry, min_spend_minor, max_amount_minor,
                             avg_check_minor, avg_check_source, accepts_vouchers, points_per_scan,
                             scan_cooldown_hours, loyalty_active, created_at, updated_at)
         VALUES ($i, $o, $n, 'restaurant', 'restaurant.kebabs', 'Krakow', 'PL', $tz, 'PLN',
                 'live', $t, 'cashier', 1500, 100000, 4000, 'category', 1, 5, 24, 1, $t, $t)`,
        { i: id, o: ownerId, n: name, tz: VENUE_TZ, t: at },
      );
      await db.run(
        `INSERT INTO budgets (id, venue_id, period, currency, total_minor, loyalty_bp, created_at, updated_at)
         VALUES ($i, $v, $p, 'PLN', 100000, 6000, $t, $t)`,
        { i: newId('bdg'), v: id, p: localMonth(at, VENUE_TZ), t: at },
      );
    }
    for (const [pct, points, cap] of [
      [5, 300, 1000],
      [10, 500, 2500],
      [15, 800, 4000],
    ]) {
      await db.run(
        `INSERT INTO voucher_tiers (id, venue_id, discount_pct, points_cost, max_discount_minor, active, created_at, updated_at)
         VALUES ($i, $v, $p, $pt, $c, 1, $t, $t)`,
        { i: newId('vtr'), v: venueId, p: pct, pt: points, c: cap, t: at },
      );
    }
    /* A guide article whose body is mostly an inline image, the way the
       imported ones are — and one figure worth quoting. */
    const article = 'art_verify_transport';
    await db.run(
      `INSERT INTO guidance_articles (id, category_key, country_code, position, active, created_at, updated_at)
       VALUES ($i, 'transportation', 'PL', 1, 1, $t, $t)`,
      { i: article, t: at },
    );
    await db.run(
      `INSERT INTO translations (entity, entity_id, field, language, value, updated_at)
       VALUES ('guidance_article', $i, 'heading', 'en', 'Public Transport &amp; City Travel Cards', $t),
              ('guidance_article', $i, 'content', 'en', $c, $t)`,
      {
        i: article,
        t: at,
        c: `<p><img src="data:image/png;base64,${'A'.repeat(5000)}"></p><p>A single tram ticket in Krakow costs <strong>4.60 zł</strong> and is bought from the machine at the stop.</p>`,
      },
    );
  });

  await ledger.earn(db, { userId: customer.id, points: 640, reason: 'adjustment', at });
  await ledger.earn(db, { userId: other.id, points: 5123, reason: 'adjustment', at });

  return { db, at, customer, other, owner, rival, venueId, rivalVenueId };
}

/* ══════════════════════════════════════════════════════════════════ checks ══ */

type Mutable = { -readonly [K in keyof typeof CONFIG.llm]: (typeof CONFIG.llm)[K] };

export async function assistantModel(h: Harness): Promise<void> {
  const { describe, check, eq } = h;
  describe('§10 / B8 the assistant — the model path, against a fake endpoint');

  const config = CONFIG.llm as unknown as Mutable;
  const saved = { ...config };
  const fake = await fakeClaude();
  const logged: string[] = [];
  llm.setLogSink((line) => logged.push(line));
  const w = await world();

  try {
    /* Off is the default: the boot line says so, and asks are the router's. */
    check('off by default, and the boot line says so', llm.bootLine().startsWith('assistant: deterministic'));

    config.mode = 'live';
    config.apiKey = KEY;
    config.baseUrl = fake.base;
    config.deadlineMs = 8_000;
    config.requestTimeoutMs = 4_000;

    const line = llm.bootLine();
    check('live, the boot line names Claude and the model', line.startsWith('assistant: live via Claude') && line.includes(CONFIG.llm.model), line);
    check('…and never the key', !line.includes(KEY));

    /* ── the router's answer, for comparison ── */
    config.mode = 'off';
    const routed = await assistant.askConsumer(w.db, { userId: w.customer.id, text: 'how many points do I have', at: w.at });
    config.mode = 'live';
    const SHAPE = Object.keys(routed).sort();

    /* ── 1. a tool loop answers ── */
    const sessionId = await assistant.startConversation(w.db, { userId: w.customer.id, side: 'consumer', at: w.at });
    fake.play((_request, index) =>
      index === 0
        ? { body: callTools({ name: 'my_points' }) }
        : { body: say('You have 640 points — enough for 5% off at Verify Kebab House.') },
    );
    const answer = await assistant.askConsumer(w.db, {
      sessionId,
      userId: w.customer.id,
      text: 'how many points do I have',
      language: 'en',
      city: 'Krakow',
      at: w.at,
    });
    eq('a tool loop answers with the model’s sentence', answer.text, 'You have 640 points — enough for 5% off at Verify Kebab House.');
    eq('…in two calls: one for the tool, one for the answer', fake.seen.length, 2);

    const first = fake.seen[0];
    eq('the request carries the key and the API version', [first.headers['x-api-key'], first.headers['anthropic-version']], [KEY, '2023-06-01']);
    eq('…names the configured model', first.body.model, CONFIG.llm.model);
    eq('…caches the frozen system block', first.body.system[0].cache_control, { type: 'ephemeral' });
    check('…and keeps the date out of it', !String(first.body.system[0].text).includes(w.at.slice(0, 10)) && String(first.body.system[1].text).includes(w.at.slice(0, 10)));
    eq('…asks for chat effort on a model that takes it', first.body.output_config, { effort: CONFIG.llm.effort });
    check('…offers the server-side refusal fallback on Sonnet 5.5', first.body.fallbacks === 'default' && first.headers['anthropic-beta'] === 'server-side-fallback-2026-07-01');
    check('…and never forces a tool', first.body.tool_choice === undefined);
    const toolNames = (first.body.tools as Body[]).map((spec) => spec.name);
    check('the consumer tools are offered', ['my_points', 'my_play_status', 'my_wallet', 'search_places', 'search_guide'].every((name) => toolNames.includes(name)), toolNames);
    check(
      'no consumer tool takes a user',
      (first.body.tools as Body[]).every((spec) => Object.keys(spec.input_schema.properties ?? {}).every((key) => !/user/i.test(key))),
    );
    check('the knowledge block is read from the live configuration', String(first.body.system[0].text).includes(`Free ${CONFIG.games.weeklyGameCap.free}`));

    const second = fake.seen[1];
    eq('the assistant’s turn goes back unchanged, thinking block and all', second.body.messages[1], {
      role: 'assistant',
      content: callTools({ name: 'my_points' }).content,
    });
    const results = toolResults(second.body);
    eq('every tool result is in one user message, by id', results.map((r) => r.tool_use_id), ['toolu_0']);
    check('…and it is the asker’s balance', results[0]?.content.includes('"balance":640'), results[0]?.content);

    eq('the response keeps the router’s shape', Object.keys(answer).sort(), SHAPE);
    check('…its facts are the figures the sentence used', answer.facts.some((fact) => fact.kind === 'balance' && fact.value === 640), answer.facts);
    check('…and only those', answer.facts.every((fact) => llm.mentions(answer.text, typeof fact.value === 'number' ? fact.value : String(fact.value))), answer.facts);
    check('…its results are rows the clients can draw', answer.results.length > 0 && answer.results.every((row) => typeof (row as Body).name === 'string'), answer.results);
    check('…with a real destination', answer.action !== null && answer.action.href.startsWith('#/'), answer.action);
    eq('…and it is not empty', answer.empty, false);
    const stored = await w.db.all<{ role: string; answered_by: string | null }>(
      `SELECT role, answered_by FROM assistant_messages WHERE session_id = $s ORDER BY seq`,
      { s: sessionId },
    );
    eq('the transcript records that the model answered', stored.map((row) => [row.role, row.answered_by]), [['user', null], ['assistant', 'model']]);

    /* ── conversation memory ── */
    fake.play(() => ({ body: say('Yes — 640 points.') }));
    await assistant.askConsumer(w.db, { sessionId, userId: w.customer.id, text: 'is that enough?', language: 'en', at: w.at });
    const memory = fake.seen[0].body.messages as Body[];
    eq('a follow-up carries the earlier exchange, then the new question', memory.map((m) => [m.role, m.content]), [
      ['user', 'how many points do I have'],
      ['assistant', 'You have 640 points — enough for 5% off at Verify Kebab House.'],
      ['user', 'is that enough?'],
    ]);

    /* ── 2. a failure is the router's answer, logged without the words ── */
    const fallsBack = async (what: string, script: Script, reason: string) => {
      logged.length = 0;
      fake.play(script);
      const session = await assistant.startConversation(w.db, { userId: w.customer.id, side: 'consumer', at: w.at });
      const got = await assistant.askConsumer(w.db, {
        sessionId: session,
        userId: w.customer.id,
        text: 'how many points do I have',
        at: w.at,
      });
      eq(`${what}: the router answers instead`, got, routed);
      const row = await w.db.get<{ answered_by: string }>(
        `SELECT answered_by FROM assistant_messages WHERE session_id = $s AND role = 'assistant'`,
        { s: session },
      );
      eq(`${what}: …recorded as a fallback`, row?.answered_by, 'fallback');
      check(`${what}: …logged as ${reason}`, logged.length === 1 && logged[0].includes(reason), logged);
      check(`${what}: …without the question or the key`, logged.every((entry) => !entry.includes('how many points') && !entry.includes(KEY)), logged);
    };
    await fallsBack(
      'an overloaded API',
      () => ({ status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }),
      'HTTP 529 overloaded_error',
    );
    eq('…retried once before giving up', fake.seen.length, 2);
    await fallsBack('a refusal', () => ({ body: { ...say(''), content: [], stop_reason: 'refusal' } }), 'refusal');
    await fallsBack('a body that is not JSON', () => ({ body: '<html>bad gateway</html>' }), 'malformed');
    await fallsBack('an answer cut off at max_tokens', () => ({ body: { ...say('You have'), stop_reason: 'max_tokens' } }), 'max_tokens');
    config.requestTimeoutMs = 200;
    await fallsBack('a call that hangs', () => ({ body: say('too late'), delayMs: 1_000 }), 'timeout');
    config.requestTimeoutMs = 4_000;

    /* ── 3. a figure nobody retrieved ── */
    fake.play((_request, index) =>
      index === 0
        ? { body: callTools({ name: 'my_points' }) }
        : index === 1
          ? { body: say('You have 4 321 points.') }
          : { body: say('You have 640 points.') },
    );
    const corrected = await assistant.askConsumer(w.db, { userId: w.customer.id, text: 'points?', at: w.at });
    eq('an invented figure is sent back once, and the correction is kept', corrected.text, 'You have 640 points.');
    const correction = fake.seen[2]?.body.messages.at(-1);
    check('…the correction names the figure', typeof correction?.content === 'string' && correction.content.includes('4 321'), correction);
    eq('…after the rejected answer, unchanged', fake.seen[2]?.body.messages.at(-2)?.content, say('You have 4 321 points.').content);

    await fallsBack(
      'an answer that invents a figure twice',
      (_request, index) => (index === 0 ? { body: callTools({ name: 'my_points' }) } : { body: say('You have 7777 points.') }),
      'ungrounded',
    );

    /* ── 4. a tool cannot be pointed at somebody else ── */
    fake.play((_request, index) =>
      index === 0
        ? { body: callTools({ name: 'my_points', input: { user_id: w.other.id } }, { name: 'my_wallet', input: { userId: w.other.id } }) }
        : { body: say('You have 640 points.') },
    );
    await assistant.askConsumer(w.db, { userId: w.customer.id, text: 'show me their points', at: w.at });
    const scoped = toolResults(fake.seen[1].body);
    eq('two tools asked for at once are answered together', scoped.length, 2);
    check('a user id in the input is ignored: the asker’s balance comes back', scoped[0]?.content.includes('"balance":640'), scoped[0]?.content);
    check('…never the other account’s', scoped.every((r) => !r.content.includes('5123')), scoped);

    /* ── the guide ── */
    fake.play((_request, index) =>
      index === 0
        ? { body: callTools({ name: 'search_guide', input: { query: 'tram ticket' } }) }
        : { body: say('A single tram ticket costs 4.60 zł; buy it from the machine at the stop.') },
    );
    const guided = await assistant.askConsumer(w.db, { userId: w.customer.id, text: 'How much is a tram ticket in Kraków?', at: w.at });
    eq('a practical city question is answered from the guide', guided.text, 'A single tram ticket costs 4.60 zł; buy it from the machine at the stop.');
    const excerpt = toolResults(fake.seen[1].body)[0]?.content ?? '';
    check('…the article reached the model as plain text', excerpt.includes('Public Transport & City Travel Cards') && excerpt.includes('4.60 zł'), excerpt.slice(0, 300));
    check('…without its inline image', !excerpt.includes('base64'));
    check('…and it is on the record', guided.grounding.includes('art_verify_transport'), guided.grounding);

    /* ── the round ceiling ── */
    config.toolRounds = 2;
    fake.play((request) =>
      request.tool_choice?.type === 'none' ? { body: say('Here is what I found.') } : { body: callTools({ name: 'my_play_status' }) },
    );
    const capped = await assistant.askConsumer(w.db, { userId: w.customer.id, text: 'keep looking', at: w.at });
    eq('past the round ceiling the model is made to answer', [capped.text, fake.seen.length], ['Here is what I found.', 3]);
    eq('…with tools switched off on that last call only', fake.seen.map((s) => s.body.tool_choice?.type ?? null), [null, null, 'none']);
    config.toolRounds = saved.toolRounds;

    /* ── the fallback parameter turns itself off when the API refuses it ── */
    fake.play((request) =>
      request.fallbacks
        ? { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: not available for this account' } } }
        : { body: say('Fine.') },
    );
    const healed = await assistant.askConsumer(w.db, { userId: w.customer.id, text: 'hello', at: w.at });
    eq('a request refused for the fallback parameter is sent again without it', [healed.text, fake.seen.length], ['Fine.', 2]);
    check('…and the retry carries neither the field nor the beta header', fake.seen[1].body.fallbacks === undefined && fake.seen[1].headers['anthropic-beta'] === undefined);

    /* ── effort only where it is accepted ── */
    eq('effort is offered to the current models',
      ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-opus-4-5', 'claude-sonnet-4-6'].map(llm.acceptsEffort), [true, true, true, true, true]);
    eq('…and not to the ones that reject it',
      ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-sonnet-4-5-20250929', 'gpt-x'].map(llm.acceptsEffort), [false, false, false, false]);
    config.model = 'claude-haiku-4-5';
    fake.play(() => ({ body: say('Hi.') }));
    await assistant.askConsumer(w.db, { userId: w.customer.id, text: 'hello', at: w.at });
    check('a pinned older model is sent no effort and no fallback', fake.seen[0].body.output_config === undefined && fake.seen[0].body.fallbacks === undefined);
    config.model = saved.model;

    /* ── 5. the partner side ── */
    fake.play((_request, index) =>
      index === 0
        ? { body: callTools({ name: 'venue_month' }, { name: 'venue_budget' }) }
        : { body: say('Nothing measured yet this month; the budget available is 1000.00 PLN.') },
    );
    const briefed = await assistant.askPartner(w.db, {
      venueId: w.venueId,
      userId: w.owner.id,
      text: 'How am I doing and what should I do next?',
      language: 'pl',
      at: w.at,
    });
    eq('an owner’s question is answered by the model', briefed.text, 'Nothing measured yet this month; the budget available is 1000.00 PLN.');
    eq('…with no report rows, so the dashboard reads it as prose', briefed.results, []);
    check('…its receipt is the venue’s budget, in minor units with the currency', briefed.facts.some((fact) => fact.kind === 'budget' && fact.value === 100000 && fact.currency === 'PLN'), briefed.facts);
    check('…in the reader’s language', String(fake.seen[0].body.system[1].text).includes('Polish'));
    const partnerToolNames = (fake.seen[0].body.tools as Body[]).map((spec) => spec.name);
    check('the partner tools are offered, none taking a venue', partnerToolNames.includes('venue_top_customers') &&
      (fake.seen[0].body.tools as Body[]).every((spec) => Object.keys(spec.input_schema.properties ?? {}).every((key) => !/venue/i.test(key))), partnerToolNames);
    check('…and the venue’s month reached the model', toolResults(fake.seen[1].body).some((r) => r.content.includes('"currency":"PLN"')));

    fake.play(() => ({ body: say('should never be asked') }));
    try {
      await assistant.askPartner(w.db, { venueId: w.rivalVenueId, userId: w.owner.id, text: 'their sales?', at: w.at });
      check('asking about a venue you do not manage is refused', false, 'answered');
    } catch (error) {
      check('asking about a venue you do not manage is refused', error instanceof DomainError && error.code === 'forbidden', String(error));
    }
    eq('…before the model is called', fake.seen.length, 0);
    try {
      await partnerTools(w.db, { userId: w.owner.id, venueId: w.rivalVenueId, language: 'en', at: w.at }).run('venue_month', {});
      check('a partner tool bound to another venue refuses to read it', false, 'read it');
    } catch (error) {
      check('a partner tool bound to another venue refuses to read it', error instanceof DomainError && error.code === 'forbidden', String(error));
    }

    const customers = await partnerTools(w.db, { userId: w.owner.id, venueId: w.venueId, language: 'en', at: w.at }).run('venue_top_customers', {});
    eq('named customers are refused on a plan without profiles', (customers.data as Body).available, false);

    /* ── over HTTP: the same shape, and the same refusals ── */
    const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET });
    const server = await api.listen(0, '127.0.0.1');
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    try {
      const token = async (email: string) => (await accounts.signIn(w.db, { email, password: 'hunter22', at: w.at })).token;
      const post = async (path: string, body: Body, bearer: string) => {
        const response = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: (await response.json()) as Body };
      };
      /* A second account: the first has spent its five free questions above. */
      const asker = await token('ask-other@verify.test');
      fake.play((_request, index) =>
        index === 0 ? { body: callTools({ name: 'search_places', input: { query: 'kebab' } }) } : { body: say('Verify Kebab House is a kebab place in Krakow.') },
      );
      const live = await post('/v1/assistant/ask', { text: 'where can I eat kebab?' }, asker);
      eq('POST /v1/assistant/ask answers through the model', [live.status, live.body.text], [200, 'Verify Kebab House is a kebab place in Krakow.']);
      eq('…in exactly the shape it always had', Object.keys(live.body).sort(), SHAPE);
      check('…with the venue as a row both clients can open', ((live.body.results ?? []) as Body[]).some((row) => row.name === 'Verify Kebab House' && row.venue_id === w.venueId), live.body.results);

      config.mode = 'off';
      const off = await post('/v1/assistant/ask', { text: 'how many points do I have' }, asker);
      eq('…and with the model off, the same shape from the router', Object.keys(off.body).sort(), SHAPE);
      config.mode = 'live';

      fake.play(() => ({ body: say('should never be asked') }));
      const refused = await post(`/v1/partner/venues/${w.rivalVenueId}/assistant/ask`, { text: 'their sales?' }, await token('ask-owner@verify.test'));
      eq('an owner asking about another venue is refused at the route', refused.status, 403);
      eq('…and the model is never called', fake.seen.length, 0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    /* ── the guard, as text ── */
    const sources = ['{"spend":"1234.50 PLN","expires":"2026-10-15T00:00:00Z","balance":640}'];
    check('a Polish grouped decimal is the same figure', llm.groundedNumbers('Wydano 1 234,50 zł.', sources).ok);
    check('a date written the local way is grounded part by part', llm.groundedNumbers('Ważny do 15.10.2026.', sources).ok);
    check('list numbering is not a figure', llm.groundedNumbers('1. Open the app\n2. Tap Play', []).ok);
    eq('an invented figure is named', llm.groundedNumbers('You have 641 points.', sources).unknown, ['641']);
    check('a fact counts only when its figure is written', llm.mentions('You have 640 points', 640) && !llm.mentions('You have 64 points', 640));
    check('…and the 00 of a clock is not a zero', !llm.mentions('Open until 22:00.', 0) && llm.mentions('You have 0 vouchers.', 0));
    check('…while a money figure matches however it is written', llm.mentions('Available: 1 000,00 zł.', '1000.00 PLN'));

    /* ── the parts, on their own ── */
    check('HTML is stripped to text, images and all', stripHtml('<p>Hi&nbsp;<img src="data:x">there &amp; <b>4</b></p>') === 'Hi there & 4');
    const box = consumerTools(w.db, { userId: w.customer.id, language: 'en', city: 'Krakow', at: w.at });
    const unknown = await box.run('drop_tables', {});
    check('an unknown tool is an error result, not a throw', unknown.error === true);
    const partnerPrompt = await systemFor(w.db, 'partner');
    check('the partner prompt states the cohort floor in force', partnerPrompt.includes(`fewer than ${CONFIG.privacy.minCohort} customers`));
  } finally {
    Object.assign(config, saved);
    llm.setLogSink(null);
    await fake.close();
    await w.db.close();
  }
}

/* Run alone: `node server/verify-assistant.ts`. */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.env.PAYLEZ_QUIET = '1';
  let passed = 0;
  const failures: string[] = [];
  await assistantModel({
    describe: (name) => console.log(`\n── ${name}`),
    check: (what, condition, detail) => {
      if (condition) passed += 1;
      else {
        failures.push(what);
        console.log(`   ✗ ${what}`, detail ?? '');
      }
    },
    eq: (what, actual, expected) => {
      if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
      else {
        failures.push(what);
        console.log(`   ✗ ${what}`, { actual, expected });
      }
    },
  });
  console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}`);
  if (failures.length) process.exitCode = 1;
}

