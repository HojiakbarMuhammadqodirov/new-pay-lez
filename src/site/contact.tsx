import { useState } from 'react';
import {
  CONTACT_CHANNEL_ICONS,
  CONTACT_EMAIL,
  CONTACT_STATS,
  SALES_EMAIL,
  SOCIALS,
} from './content';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { PATHS } from './router';

/**
 * Contact — the seventh page, and where every "Support" link on the site lands.
 *
 * It exists because the footer had two entries that went nowhere and a sitemap
 * with no way to reach anybody in it. Four channels and one form, and the form
 * is the whole reason this file needs a comment.
 *
 * **The form does not post anywhere, and says so.** There is no server in this
 * repo — no network layer at all under `src/` — so a form with a Send button
 * would be a promise the page cannot keep, and the usual way that gets built is
 * a `setTimeout` and a green tick over a message nobody received. Instead the
 * button composes a `mailto:` and hands it to the reader's own mail client:
 * the subject, the address and the body are all filled in, and the send button
 * is theirs. That is a real action with a real outcome, and `form.note` tells
 * the reader exactly what is about to happen before they press it.
 *
 * The backdrop is the globe, as it is on sign-in and for the same reason: this
 * is a short page with nothing to scroll through, so the globe holds its hero
 * pose rather than travelling. See `scrollTransition` in `Site.tsx`.
 */

/* ─────────────────────────────────────────────────────────────────── hero ── */

function ContactHero() {
  const copy = useCopy();

  return (
    <section className="hero" id="contact-top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <a className="learn-back" href={PATHS.landing} data-reveal>
            <Icon name="arrow" size={15} strokeWidth={2.2} />
            {copy.contact.back}
          </a>

          <span className="eyebrow learn-eyebrow" data-reveal>
            {copy.contact.hero.eyebrow}
          </span>

          <h1 data-reveal>
            {copy.contact.hero.lines.map((line, i) => (
              <span className="ln" key={line}>
                {i === copy.contact.hero.lines.length - 1 ? (
                  <span className="accent-text">{line}</span>
                ) : (
                  line
                )}
              </span>
            ))}
          </h1>

          <p className="hero-lede" data-reveal>
            {copy.contact.hero.lede}
          </p>

          <div className="hero-cta" data-reveal>
            <a href="#contact-form" className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.contact.form.eyebrow}
            </a>
            <a href="#contact-channels" className="btn btn-ghost btn-lg">
              {copy.contact.channels.eyebrow}
            </a>
          </div>

          <div className="hero-meta" data-reveal>
            {CONTACT_STATS.map((stat, i) => (
              <div className="hero-stat-row" key={copy.contact.hero.stats[i]}>
                {i > 0 && <span className="hero-stat-div" />}
                <div className="hero-stat">
                  <b data-count={stat.value} data-suffix={stat.suffix}>
                    0
                  </b>
                  <span>{copy.contact.hero.stats[i]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reserved for the globe layer behind the page, as on the landing page. */}
        <div className="hero-visual" aria-hidden />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────── channels ── */

/**
 * The four ways in.
 *
 * Every destination is derived rather than typed here: the two inboxes come from
 * `CONTACT_EMAIL` / `SALES_EMAIL` and the two channels from `SOCIALS`, so a
 * changed address is one edit and cannot go stale in half the places it appears.
 */
function ContactChannels() {
  const copy = useCopy();

  const targets = [
    { href: `mailto:${CONTACT_EMAIL}`, meta: CONTACT_EMAIL, external: false },
    { href: `mailto:${SALES_EMAIL}`, meta: SALES_EMAIL, external: false },
    ...SOCIALS.map((social) => ({
      href: social.href,
      meta: social.handle,
      external: true,
    })),
  ];

  return (
    <section className="section" id="contact-channels">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.contact.channels.eyebrow}</span>
          <h2>{copy.contact.channels.title}</h2>
          <p>{copy.contact.channels.lede}</p>
        </div>

        <div className="ct-channels">
          {copy.contact.channels.items.map((item, i) => (
            <a
              className="ct-channel"
              key={item.name}
              href={targets[i].href}
              data-reveal
              {...(targets[i].external
                ? { target: '_blank', rel: 'noreferrer noopener' }
                : {})}
            >
              <span className="ct-ico">
                <Icon name={CONTACT_CHANNEL_ICONS[i]} size={22} />
              </span>
              <h3>{item.name}</h3>
              <p>{item.blurb}</p>
              <span className="ct-meta">{targets[i].meta}</span>
              <span className="ct-go">
                {item.action}
                <Icon name="arrow" size={15} strokeWidth={2.4} />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── form ── */

/**
 * The message composer.
 *
 * `mailto:` rather than a POST, for the reason in the file header. Two details
 * matter: the body is assembled with real newlines and encoded once with
 * `encodeURIComponent` (a raw `\n` in a `mailto:` is dropped by some clients),
 * and the reply-to address the reader typed goes *into the body* rather than
 * into a `?from=`, which no client honours and every spam filter dislikes.
 */
function ContactForm() {
  const copy = useCopy();
  const [topic, setTopic] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError(true);
      return;
    }
    setError(false);

    /* A partnership goes to the other inbox — the same split the channel cards
       make, honoured by the topic the reader picked rather than ignored. */
    const to = topic === 2 ? SALES_EMAIL : CONTACT_EMAIL;
    const subject = `${copy.contact.form.topics[topic]} — ${name.trim()}`;
    const body = `${message.trim()}\n\n—\n${name.trim()}\n${email.trim()}`;

    window.location.href = `mailto:${to}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <section className="section" id="contact-form">
      <div className="wrap split">
        <div className="split-copy">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.contact.form.eyebrow}</span>
            <h2>{copy.contact.form.title}</h2>
            <p>{copy.contact.form.lede}</p>
          </div>

          <div className="ct-hours" data-reveal>
            <h4>{copy.contact.hours.title}</h4>
            <p>{copy.contact.hours.body}</p>
            <p className="ct-where">
              <Icon name="map" size={15} />
              {copy.contact.hours.address}
            </p>
          </div>
        </div>

        <div className="split-visual" data-reveal>
          {/* The shared field kit — `.field`, `.field-row`, `.field-label` — the
              same one sign-in and the listing form use. See the `══ forms ══`
              block in site.css. */}
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

            {/* Weighted rather than red: the palette has one accent, so an error
                is louder by contrast. See the field kit's note in site.css. */}
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
  );
}

/** The page, in order. */
export function ContactPage() {
  return (
    <main>
      <ContactHero />
      <ContactChannels />
      <ContactForm />
    </main>
  );
}
