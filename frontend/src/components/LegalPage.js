import '../LegalPage/LegalPage.css';
import Header from './Header';
import Footer from './Footer';

/**
 * Page frame for the Terms and Privacy pages: site header, gradient title band, content, site footer.
 * Same look as the Data Security page.
 */
export function LegalPage({ title, subtitle, updated, children }) {
  return (
    <div className="legal-page">
      <Header />
      <div className="lg-hero">
        <h1 className="lg-title">{title}</h1>
        {subtitle && <p className="lg-subtitle">{subtitle}</p>}
        {updated && <div className="lg-updated">Last updated: {updated}</div>}
      </div>
      <main className="lg-body">{children}</main>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
}

/** One section: heading on the left, text on the right. `level` is the heading level (2 or 3). */
export function LegalSection({ title, level = 2, children }) {
  const H = `h${level}`;
  return (
    <section className="lg-sect">
      <H>{title}</H>
      <div className="lg-text">{children}</div>
    </section>
  );
}

export default LegalPage;
