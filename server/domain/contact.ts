/**
 * Messages sent from the website's Contact page.
 *
 * ## Why this exists rather than a `mailto:`
 *
 * The page used to compose a `mailto:` and hand it to the reader's own mail
 * client. That was the honest thing to do while there was no server under
 * `src/` — a Send button with nothing behind it is a promise the page cannot
 * keep, and the usual way that gets built is a `setTimeout` and a green tick
 * over a message nobody received.
 *
 * There is a server now, so the honest thing changed. A `mailto:` costs the
 * sender a mail client that is configured, willing and not a webmail tab, and
 * every message it loses is lost *silently* — the reader believes they sent it.
 * It also puts the record in one person's inbox rather than in the console the
 * operator already opens.
 *
 * ## What it is not
 *
 * **It does not send email.** Nothing here has an SMTP credential and nothing
 * here should acquire one to satisfy this feature; the message lands in a table
 * and the console reads it. If mail delivery is wanted later it belongs beside
 * this, reading the same table, rather than in place of it — a copy that goes
 * out is a convenience, and the row is the record.
 *
 * ## Who may write
 *
 * Anybody, signed in or not. That is the point of a contact form, and it is
 * also the whole risk: a public endpoint that writes rows is a public endpoint
 * that writes rows. Three brakes, in order of how much they cost an honest
 * sender:
 *
 * - **A per-address hourly limit**, the same shape `throttleSignIn` uses and
 *   for the same reason — keyed on what was *typed* rather than on an account,
 *   because the sender may not have one.
 * - **A per-connection hourly limit**, keyed on the same daily visitor hash the
 *   traffic beacon uses, so somebody cycling addresses is still bounded and
 *   nothing durable is stored about them.
 * - **Length caps on every field**, refused rather than truncated: silently
 *   storing half of what somebody wrote is the failure mode this whole file
 *   exists to avoid.
 *
 * A refusal is `quota_exceeded`, deliberately not the sign-in's
 * disguise: there is nothing to enumerate here, so telling an honest sender
 * they have hit a limit costs nothing and saves them retyping.
 */
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { now, plusMinutes, type Iso } from './time.ts';
import { visitorKey } from './traffic.ts';

/** What the form offers, index-aligned with `copy.contact.form.topics`. */
export const TOPICS = ['support', 'feedback', 'partnership', 'other'] as const;
export type Topic = (typeof TOPICS)[number];

export const isTopic = (value: string): value is Topic =>
  (TOPICS as readonly string[]).includes(value);

/**
 * Where a message is in the operator's own workflow.
 *
 * Three and not four: `new` is the inbox, `read` is "seen, nothing owed",
 * `done` is "answered or dealt with". There is no `spam`, because deleting is
 * what an operator actually wants there and this console has no delete — see
 * the note on `setStatus`.
 */
export const STATUSES = ['new', 'read', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const isStatus = (value: string): value is Status =>
  (STATUSES as readonly string[]).includes(value);

export interface ContactMessage {
  id: string;
  topic: Topic;
  name: string;
  email: string;
  body: string;
  status: Status;
  /** The account, when the sender happened to be signed in. */
  userId: string | null;
  language: string | null;
  createdAt: Iso;
}

interface Row {
  id: string;
  topic: string;
  name: string;
  email: string;
  body: string;
  status: string;
  user_id: string | null;
  language: string | null;
  created_at: string;
}

const shape = (row: Row): ContactMessage => ({
  id: row.id,
  topic: row.topic as Topic,
  name: row.name,
  email: row.email,
  body: row.body,
  status: row.status as Status,
  userId: row.user_id,
  language: row.language,
  createdAt: row.created_at,
});

/**
 * The caps, in characters.
 *
 * `BODY_MAX` is generous on purpose — the form asks for "which screen, what you
 * expected, and what it did instead", and somebody who answers all three
 * properly writes more than a tweet. It is a bound against a script, not
 * against a thorough bug report.
 */
const NAME_MAX = 120;
const EMAIL_MAX = 254; /* The RFC's own ceiling for an address. */
const BODY_MAX = 8_000;

/** The shape of an address, matching the front end's own `isEmail`. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function limit(db: Db, column: 'email_norm' | 'sender_day', value: string, at: Iso): Promise<void> {
  const since = plusMinutes(at, -60);
  const row = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM contact_messages WHERE ${column} = $v AND created_at >= $since`,
    { v: value, since },
  );
  if ((row?.n ?? 0) >= CONFIG.contact.perHour) {
    throw new DomainError('quota_exceeded', 'too many messages from here in the last hour');
  }
}

export async function submit(
  db: Db,
  input: {
    topic: string;
    name: string;
    email: string;
    body: string;
    userId?: string | null;
    language?: string | null;
    ip: string;
    agent: string;
    /* The server secret, passed in rather than read here for the same reason
       `traffic.record` takes it: this module does not own it and a domain file
       that reaches for a process secret is one that cannot be tested. */
    secret: string;
    at?: Iso;
  },
): Promise<{ id: string; createdAt: Iso }> {
  const at = input.at ?? now();

  const topic = input.topic.trim().toLowerCase();
  if (!isTopic(topic)) throw new DomainError('validation_failed', 'unknown topic');

  const name = input.name.trim();
  const email = input.email.trim();
  const body = input.body.trim();

  if (!name || !email || !body) {
    throw new DomainError('validation_failed', 'name, email and message are required');
  }
  if (name.length > NAME_MAX) throw new DomainError('validation_failed', 'name is too long');
  if (email.length > EMAIL_MAX || !EMAIL.test(email)) {
    throw new DomainError('validation_failed', 'that email address does not look right');
  }
  if (body.length > BODY_MAX) {
    throw new DomainError('validation_failed', 'message is too long');
  }

  /* The same rotating hash the traffic beacon uses: enough to bound a sender
     for an hour, not enough to recognise them tomorrow. */
  const senderDay = visitorKey(input.secret, at.slice(0, 10), input.ip, input.agent);
  const emailNorm = email.toLowerCase();

  await limit(db, 'email_norm', emailNorm, at);
  await limit(db, 'sender_day', senderDay, at);

  const id = newId('msg');
  await db.run(
    `INSERT INTO contact_messages
       (id, topic, name, email, email_norm, body, status, user_id, language, sender_day, created_at)
     VALUES ($id, $topic, $name, $email, $norm, $body, 'new', $user, $lang, $day, $at)`,
    {
      id,
      topic,
      name,
      email,
      norm: emailNorm,
      body,
      user: input.userId ?? null,
      lang: input.language ?? null,
      day: senderDay,
      at,
    },
  );

  return { id, createdAt: at };
}

/**
 * The console's list, newest first.
 *
 * `status` filters; omitting it returns everything, because "what came in this
 * week" is as real a question as "what is still unanswered".
 */
export async function list(
  db: Db,
  input: { status?: Status; limit?: number } = {},
): Promise<{ messages: ContactMessage[]; counts: Record<Status, number> }> {
  const take = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = input.status
    ? await db.all<Row>(
        `SELECT * FROM contact_messages WHERE status = $s ORDER BY created_at DESC LIMIT $n`,
        { s: input.status, n: take },
      )
    : await db.all<Row>(`SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT $n`, { n: take });

  /* Counted across the whole table rather than across the page, because the
     number beside a filter chip is about the table and not about this page of
     it — a chip reading "new 12" over a list of 12 that is actually 40 is the
     bug that makes an operator stop trusting the console. */
  const counts: Record<Status, number> = { new: 0, read: 0, done: 0 };
  for (const row of await db.all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM contact_messages GROUP BY status`,
  )) {
    if (isStatus(row.status)) counts[row.status] = row.n;
  }

  return { messages: rows.map(shape), counts };
}

/**
 * Move one message along.
 *
 * There is no delete, and that is the rule the rest of this console follows: it
 * reports, and the one thing it may write is the operator's own view of a row.
 * A message somebody sent is a record; `done` is what "dealt with" looks like
 * on a record.
 */
export async function setStatus(db: Db, id: string, status: Status, at: Iso = now()): Promise<ContactMessage> {
  const row = await db.get<Row>(`SELECT * FROM contact_messages WHERE id = $id`, { id });
  if (!row) throw new DomainError('not_found', 'no such message');

  await db.run(`UPDATE contact_messages SET status = $s, handled_at = $at WHERE id = $id`, {
    s: status,
    at,
    id,
  });

  return shape({ ...row, status });
}
