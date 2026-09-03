import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The last resort, and the reason it exists is a black page.
 *
 * A `TypeError` thrown during render does not break the panel it was thrown in
 * — React unmounts the **entire tree** and leaves the document body, which on
 * this site is `--bg`. So the symptom of one missing field on one response was
 * a partner opening `#/dashboard` and being shown a black rectangle: no header,
 * no message, nothing to press, and nothing to report beyond "it is black".
 * (The field was `budget.averageCheck`, absent from `GET .../overview` and
 * present on `GET .../budget`; `server/http/routes/partner.ts` carries that
 * story at `budgetBody`.)
 *
 * Fixing the field is the fix. This is the thing that makes the *next* one
 * legible instead of invisible — the crash is caught, the frame survives, and
 * what is on screen names the screen that failed and offers the two ways out
 * somebody actually has.
 *
 * ## Three decisions
 *
 * **It is not translated, and that is deliberate.** This panel renders when
 * something in the tree threw, and `LanguageProvider` is *in* that tree — a
 * boundary that reaches for `useCopy()` to describe a broken render is a
 * boundary that can throw while reporting a throw. Everything here is plain
 * English and inline tokens for the same reason `WriteStrip` prints the
 * server's own sentence rather than a dictionary line: an accurate message in
 * one language beats a translated one that cannot be produced.
 *
 * **It clears itself on navigation.** A boundary latches: once `hasError` is
 * set it renders the panel for ever, so without this the whole site would stay
 * broken until a reload even after the visitor moved to a page that works.
 * Listening for `hashchange` is the whole of it, because the hash *is* the
 * router here.
 *
 * **The error text is shown, not hidden.** Nothing this app throws carries
 * anything private — these are property accesses on a response shape — and a
 * person who can paste `Cannot read properties of undefined (reading 'minor')`
 * into a message has reported the bug. "Something went wrong" has reported
 * nothing.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.clear);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.clear);
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* The console is where a developer looks, and React's own overlay is gone
       in a production build — so the component stack goes here or nowhere. */
    console.error('[paylez] render failed', error, info.componentStack);
  }

  clear = () => {
    if (this.state.error !== null) this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="site site-app" id="top" data-intro="done">
        <main className="crash">
          <div className="crash-card">
            <span className="brand">paylez</span>
            <h1>This screen did not load.</h1>
            <p>
              Something on this page failed while it was being drawn. The rest of the site is
              fine — the two buttons below are the ways out.
            </p>
            <pre>{error.message}</pre>
            <div className="crash-acts">
              <button
                type="button"
                className="btn btn-solid"
                onClick={() => window.location.reload()}
              >
                Reload this page
              </button>
              {/* A plain `href` rather than a router call: the router lives in
                  the tree that just threw, and this button has to work when
                  that is exactly what is broken. */}
              <a className="btn btn-ghost" href="#/">
                Back to paylez
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }
}
