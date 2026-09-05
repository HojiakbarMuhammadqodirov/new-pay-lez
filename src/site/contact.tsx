import { useState } from 'react';
import { CONTACT_TOPICS as TOPICS, SOCIALS } from './content';
import { ApiError, call } from './api/client';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { PATHS } from './router';

/**
 * Contact — one screen, one form.
 *
 * It used to be three sections: a hero with a headline and three count-up
 * stats, a grid of four channel cards, and the form. That is the shape of a
 * marketing page, and it was the *landing page's* shape in particular — the
 * same hero grid, the same eyebrow, the same stat row — on a page whose entire
 * job is to let somebody send a message. Two of the three sections were
 * restating in three paragraphs what the form's own labels say in three words,
 * and a visitor who has clicked "Contact" has already decided; they do not need
 * selling to. So: the form, what it does, when it will be answered, and where
 * else we are. Nothing above it.
 *
 * **The form posts to `POST /v1/contact`, and the message lands in the
 * console.** It used to compose a `mailto:` and hand it to the reader's own
 * mail client, which was the honest thing to do while there was nothing under
 * `src/` to post to — a Send button with nothing behind it is a promise the
 * page cannot keep. There is a server now, and a `mailto:` costs the sender a
 * mail client that is configured, willing and not a webmail tab; every message
 * it loses is lost *silently*, because the reader believes they sent it.
 *
 * Two things follow, and both are visible on the screen. The button says
 * "Submit the message" rather than naming somebody else's app, because this
 * page is what sends it now. And the three ways it can end are three different
 * sentences — sent, refused, or *the server is not there* — because the last of
 * those is the one a `setTimeout` and a green tick would hide, and it is the
 * one where the reader still has something to do about it.
 *
 * **The backdrop is `streets/StreetMap`, and the rule it broke is worth
 * restating.** This page had no backdrop for a while, and the reason was sound
 * but narrower than it read: a globe held in its **hero pose** over a
 * one-screen page sits straight on top of the form, and `scrollAnchorId` — the
 * thing that retires it into an arc — needs content below the fold to do it
 * with. That is an argument about the globe's scroll transition, not about
 * whether a form may have a layer behind it. The four canvas backdrops have no
 * hero pose and no transition.
 *
 * So the page gets the one picture it can honestly carry: getting in touch is a
 * **route**. The two legal pages keep their empty ground, on the other half of
 * the old argument — a retention schedule has no honest picture, and a moving
 * field under six pages of clauses is a readability cost paid for decoration.
 *
 * The map's alphas are the lowest on the site (`STREETS.tone`), because this is
 * the only backdrop here sitting under fields somebody is typing an address
 * into.
 */
export function ContactPage() {
  const copy = useCopy();
  const [topic, setTopic] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  /**
   * What the form is doing, as one value rather than three booleans.
   *
   * `sending` has to lock the button — a form that can be pressed twice is a
   * form that files the same message twice, and this one has a rate limit that
   * would then refuse the second press and show a failure for a message that
   * arrived. `problem` carries the *reason*, because "we could not reach the
   * server" and "you left the message empty" are different problems with
   * different next moves.
   */
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [problem, setProblem] = useState<'fields' | 'refused' | 'offline' | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === 'sending') return;

    if (!name.trim() || !email.trim() || !message.trim()) {
      setProblem('fields');
      return;
    }

    setProblem(null);
    setStatus('sending');

    try {
      await call('/v1/contact', {
        method: 'POST',
        body: {
          /* The topic goes as the server's own word rather than as the index
             this `<select>` holds or the label it shows: an index would mean
             the API's meaning changed the day somebody reordered the list, and
             the label is translated, so a Polish reader would file a topic the
             table has no name for. `TOPICS` is index-aligned with
             `copy.contact.form.topics`, which is the same arrangement every
             other list on this site uses. */
          topic: TOPICS[topic],
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        },
      });
      setStatus('sent');
    } catch (cause) {
      setStatus('idle');
      /* Status 0 is "we never reached it" — see `ApiError` in `api/client.ts`.
         Anything else is a server that answered and said no, which for this
         form is either a bad address or the hourly limit. */
      setProblem(cause instanceof ApiError && cause.status === 0 ? 'offline' : 'refused');
    }
  };

  return (
    <main>
      <section className="section ct-page" id="contact-form">
        <div className="wrap split ct-split">
          {/*
            The left column is a column, and the gap in it is deliberate: the
            heading sits at the top, and the hours and the two channels are
            pushed to the *bottom* by `margin-top: auto` in the sheet, so the
            last thing in this column lands on the same line as the last thing
            in the form beside it. Two columns of different natural heights
            ending at different places is what made this look unfinished, and
            the fix belongs in the layout rather than in a hand-tuned margin.
          */}
          <div className="split-copy ct-copy">
            <div>
              <a className="learn-back" href={PATHS.landing} data-reveal>
                <Icon name="arrow" size={15} strokeWidth={2.2} />
                {copy.contact.back}
              </a>

              <div className="section-head left ct-head" data-reveal>
                <span className="eyebrow">{copy.contact.form.eyebrow}</span>
                <h1>{copy.contact.form.title}</h1>
                <p>{copy.contact.form.lede}</p>
              </div>
            </div>

            <div className="ct-foot" data-reveal>
              <div className="ct-hours">
                <h4>{copy.contact.hours.title}</h4>
                <p>{copy.contact.hours.body}</p>
                <p className="ct-where">
                  <Icon name="map" size={15} />
                  {copy.contact.hours.address}
                </p>
              </div>

              {/*
                The two channels, as buttons rather than as the four-card grid
                this page used to open with. Everything on them is derived —
                `SOCIALS` owns the destination and the handle, so a changed
                account is one edit — and nothing on them is translated, because
                a channel name and a handle are the same words in five
                languages. The label a screen reader gets is not: `footer.social`
                is the one string that has to be, and it already exists for the
                footer's pair.
              */}
              <div className="ct-socials">
                {SOCIALS.map((social) => (
                  <a
                    className="btn btn-ghost ct-social"
                    key={social.id}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={fill(copy.footer.social, { channel: social.id })}
                  >
                    <Icon name={social.id} size={18} />
                    <span className="ct-social-handle">{social.handle}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="split-visual" data-reveal>
            {/* The shared field kit — `.field`, `.field-row`, `.field-label` —
                the same one sign-in and the listing form use. See the
                `══ forms ══` block in site.css. */}
            <form className="console form-block ct-form" onSubmit={submit} noValidate>
              <div className="field">
                <label className="field-label" htmlFor="ct-topic">
                  {copy.contact.form.topic}
                </label>
                <select
                  id="ct-topic"
                  value={topic}
                  onChange={(event) => setTopic(Number(event.target.value))}
                >
                  {copy.contact.form.topics.map((label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="ct-name">
                    {copy.contact.form.name}
                  </label>
                  <input
                    id="ct-name"
                    type="text"
                    autoComplete="name"
                    placeholder={copy.contact.form.namePlaceholder}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="ct-email">
                    {copy.contact.form.email}
                  </label>
                  <input
                    id="ct-email"
                    type="email"
                    autoComplete="email"
                    placeholder={copy.contact.form.emailPlaceholder}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="ct-message">
                  {copy.contact.form.message}
                </label>
                <textarea
                  id="ct-message"
                  rows={5}
                  placeholder={copy.contact.form.messagePlaceholder}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </div>

              {/* Weighted rather than red: the palette has one accent, so an
                  error is louder by contrast. See the field kit in site.css. */}
              {problem && (
                <p className="field-error" role="alert">
                  {problem === 'fields'
                    ? copy.contact.form.error
                    : problem === 'offline'
                      ? copy.contact.form.offline
                      : copy.contact.form.refused}
                </p>
              )}

              {/* The receipt replaces the button rather than sitting under it.
                  A live Send under "we have it" invites a second press, which
                  the rate limit would then refuse — a failure message for a
                  message that arrived. */}
              {status === 'sent' ? (
                <p className="ct-sent" role="status">
                  <Icon name="check" size={17} strokeWidth={2.6} />
                  {copy.contact.form.sent}
                </p>
              ) : (
                <button
                  type="submit"
                  className="btn btn-solid btn-lg"
                  disabled={status === 'sending'}
                >
                  <Icon name="send" size={17} strokeWidth={2.2} />
                  {status === 'sending' ? copy.contact.form.sending : copy.contact.form.submit}
                </button>
              )}

              <p className="field-help ct-note">{copy.contact.form.note}</p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
