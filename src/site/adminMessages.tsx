/**
 * The console's inbox: what people wrote on the Contact page.
 *
 * The fifth tab. It was the *second* of five to ask a server, back when the
 * first three were derived on this device from `auth/directory.ts`; all five do
 * now, so what is left of that distinction is the reason this one was never in
 * doubt — "who wrote to us" is, like "who visited the site", a question about
 * people who were never in this browser.
 *
 * It follows every rule `adminWebsite.tsx` established for that case. What it
 * no longer needs is that file's sign-in panel: reaching `#/admin` at all means
 * the session already carries `admin` in its roles, so the token is in hand and
 * a second login was one person signing in twice with two accounts on one
 * screen. A token that has expired under a remembered session is a stale
 * sign-in, not a password prompt, and it says so.
 *
 * Two of those rules matter enough to restate:
 *
 * - **A failed request is a state, not an empty inbox.** `useApi` returns
 *   `loading | ready | error` precisely so that "the backend is not answering"
 *   and "nobody has written" cannot render the same way. An operator who reads
 *   an empty list believes it.
 * - **The counts come from the server, not from the page.** The number on a
 *   filter chip is a fact about the table; deriving it from the rows this page
 *   happens to hold would make it agree with the list and disagree with the
 *   truth the moment there were more than a page of them.
 *
 * The one write is `status`, and it is not a reply. There is no mail sender
 * behind this and adding one to make the screen feel finished would be building
 * it in the wrong order — what the field is for is stopping two operators
 * answering the same person.
 */
import { useState } from 'react';
import { call, hasToken } from './api/client';
import { useApi } from './api/useApi';
import { Icon } from './icons';
import { PATHS } from './router';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';

/** `contact.STATUSES` on the server, in the order the chips show them. */
const STATUSES = ['new', 'read', 'done'] as const;
type Status = (typeof STATUSES)[number];

/** `contact.TOPICS`, index-aligned with `copy.contact.form.topics`. */
const TOPICS = ['support', 'feedback', 'partnership', 'other'] as const;

interface Message {
  id: string;
  topic: string;
  name: string;
  email: string;
  body: string;
  status: Status;
  userId: string | null;
  language: string | null;
  createdAt: string;
}

interface Inbox {
  messages: Message[];
  counts: Record<Status, number>;
}

/**
 * The day a message arrived, in the reader's own locale.
 *
 * The *reader's*, and not the sender's, which is the opposite of the rule the
 * wallet's "Open now" pill follows — and the difference is who the line is
 * about. A venue's opening hours are a fact about the venue; when a message
 * landed in this console is a fact about the operator's own day.
 */
const when = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export function AdminMessages() {
  const dictionary = useCopy();
  const [language] = useLanguage();
  const copy = dictionary.admin.messages;
  const [filter, setFilter] = useState<Status | null>(null);
  /* Which rows this operator has already moved, so the list answers a press
     immediately rather than after a round trip. The server is still the record
     — `reload` reconciles — but a status chip that waits on the network reads
     as a button that did not work. */
  const [moved, setMoved] = useState<Record<string, Status>>({});

  const inbox = useApi<Inbox>(
    `/v1/admin/messages${filter ? `?status=${filter}` : ''}`,
    [filter],
  );

  /*
   * **No second sign-in.**
   *
   * Reaching this screen at all means `resolveRoute` saw an account whose type
   * is `admin`, and that type comes from `roles` on the *server's* session —
   * so a token is already in hand. The panel that used to ask for the
   * operations address and password here was a second login for the same
   * person, with a different account, on one screen; it is gone, and the seeded
   * browser admin it existed beside is gone with it.
   *
   * What can still happen is the token expiring under a session this browser
   * still remembers. That is not a password prompt, it is a stale sign-in, and
   * the honest thing is to say so and send them to the front door.
   */
  if (!hasToken()) {
    return (
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{dictionary.admin.website.expired.title}</h2>
          <p>{dictionary.admin.website.expired.body}</p>
        </div>
        <div className="adm-actions">
          <a className="btn" href={PATHS.signin}>
            {dictionary.admin.website.expired.again}
          </a>
        </div>
      </section>
    );
  }

  if (inbox.state.status === 'error') {
    const { error } = inbox.state;
    return (
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{dictionary.admin.website.down.title}</h2>
          <p>
            {error.status === 0
              ? dictionary.admin.website.down.unreachable
              : dictionary.admin.website.down.refused}
          </p>
        </div>
        <div className="adm-actions">
          <button className="btn" type="button" onClick={inbox.reload}>
            {dictionary.admin.website.down.retry}
          </button>
        </div>
      </section>
    );
  }

  if (inbox.state.status === 'loading') {
    return <p className="adm-empty">{dictionary.admin.website.loading}</p>;
  }

  const { messages, counts } = inbox.state.data;

  const move = async (id: string, status: Status) => {
    setMoved((current) => ({ ...current, [id]: status }));
    try {
      await call(`/v1/admin/messages/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { status },
      });
    } catch {
      /* Put the row back the way the server still has it. A chip that stayed
         moved after a failed write is the console lying to the one person who
         has no other way to check. */
      setMoved((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <section className="adm-block" data-reveal>
      <div className="adm-block-head">
        <h2>{copy.title}</h2>
        <p>{copy.lede}</p>
      </div>

      <div className="adm-chips" role="group" aria-label={copy.filter}>
        <button
          type="button"
          className="adm-chip"
          data-on={filter === null ? 'true' : undefined}
          onClick={() => setFilter(null)}
        >
          {copy.all}
          <b>{counts.new + counts.read + counts.done}</b>
        </button>
        {STATUSES.map((status, index) => (
          <button
            key={status}
            type="button"
            className="adm-chip"
            data-on={filter === status ? 'true' : undefined}
            onClick={() => setFilter(status)}
          >
            {copy.statuses[index]}
            <b>{counts[status]}</b>
          </button>
        ))}
      </div>

      {messages.length === 0 ? (
        <p className="adm-empty">{copy.empty}</p>
      ) : (
        <ul className="adm-msgs">
          {messages.map((message) => {
            const status = moved[message.id] ?? message.status;
            const topicIndex = TOPICS.indexOf(message.topic as (typeof TOPICS)[number]);
            return (
              <li className="adm-msg" key={message.id} data-status={status}>
                <div className="adm-msg-head">
                  <span className="adm-msg-who">
                    <b>{message.name}</b>
                    {/* The address is a `mailto:` because *replying* is the one
                        thing this console genuinely cannot do — there is no
                        sender behind it. A link that opens the operator's own
                        mail app is the honest version of that, and it is the
                        only place on this screen where one belongs. */}
                    <a href={`mailto:${message.email}`}>{message.email}</a>
                  </span>
                  <span className="adm-msg-meta">
                    <span className="adm-msg-topic">
                      {dictionary.contact.form.topics[topicIndex] ?? message.topic}
                    </span>
                    <time dateTime={message.createdAt}>
                      {when(message.createdAt, language)}
                    </time>
                  </span>
                </div>

                <p className="adm-msg-body">{message.body}</p>

                <div className="adm-msg-foot">
                  {/* Only the two moves that are forward. "Back to new" is a
                      state an operator wants roughly never and a mis-click
                      produces constantly. */}
                  {status !== 'done' && (
                    <button
                      type="button"
                      className="btn btn-ghost adm-msg-move"
                      onClick={() => void move(message.id, status === 'new' ? 'read' : 'done')}
                    >
                      <Icon name="check" size={14} strokeWidth={2.4} />
                      {status === 'new' ? copy.markRead : copy.markDone}
                    </button>
                  )}
                  {message.userId && (
                    <span className="adm-msg-tag">{copy.signedIn}</span>
                  )}
                  {message.language && (
                    <span className="adm-msg-tag">
                      {fill(copy.wroteIn, { language: message.language.toUpperCase() })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
