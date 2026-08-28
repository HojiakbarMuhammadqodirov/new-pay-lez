import { useState } from 'react';
import { CONTACT_EMAIL, SALES_EMAIL, SOCIALS } from './content';
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
 * **The form does not post anywhere, and says so.** There is no network layer
 * under `src/` for it to post to — so a Send button would be a promise the page
 * cannot keep, and the usual way that gets built is a `setTimeout` and a green
 * tick over a message nobody received. Instead the button composes a `mailto:`
 * and hands it to the reader's own mail client: the subject, the address and
 * the body are all filled in, and the send button is theirs. That is a real
 * action with a real outcome, and `form.note` tells the reader exactly what is
 * about to happen before they press it.
 *
 * **No backdrop, for the same reason the two legal pages have none.** Every
 * canvas on this site is a fixed layer behind a page long enough to scroll it
 * out of the way — that is what `scrollAnchorId` is for — and this page is now
 * one screenful. A globe held in the hero pose over a one-screen page sits
 * straight on top of the form, which is precisely the failure the anchor rule in
 * the root `CLAUDE.md` describes. The page is a form; the honest ground under a
 * form is the page.
 */
export function ContactPage() {
  const copy = useCopy();
  const [topic, setTopic] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  /*
   * `mailto:` rather than a POST, for the reason in the file header. Two details
   * matter: the body is assembled with real newlines and encoded once with
   * `encodeURIComponent` (a raw `\n` in a `mailto:` is dropped by some clients),
   * and the reply-to address the reader typed goes *into the body* rather than
   * into a `?from=`, which no client honours and every spam filter dislikes.
   */
  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError(true);
      return;
    }
    setError(false);

    /* A partnership goes to the other inbox — the split the two addresses make,
       honoured by the topic the reader picked rather than ignored. */
    const to = topic === 2 ? SALES_EMAIL : CONTACT_EMAIL;
    const subject = `${copy.contact.form.topics[topic]} — ${name.trim()}`;
    const body = `${message.trim()}\n\n—\n${name.trim()}\n${email.trim()}`;

    window.location.href = `mailto:${to}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
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
              {error && (
                <p className="field-error" role="alert">
                  {copy.contact.form.error}
                </p>
              )}

              <button type="submit" className="btn btn-solid btn-lg">
                <Icon name="send" size={17} strokeWidth={2.2} />
                {copy.contact.form.submit}
              </button>

              <p className="field-help ct-note">{copy.contact.form.note}</p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
