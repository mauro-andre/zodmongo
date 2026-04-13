import { Link } from "@mauroandre/velojs";
import * as css from "./Landing.css.js";

const features = [
    {
        icon: "Z",
        title: "Zod-Native Schemas",
        desc: "Define your models with Zod. Types are inferred automatically. No proprietary schema format, no decorators.",
    },
    {
        icon: "D",
        title: "Native MongoDB Driver",
        desc: "Built directly on the official MongoDB driver. No Mongoose overhead, no hidden abstractions. Just fast, direct access.",
    },
    {
        icon: "T",
        title: "TypeScript-First",
        desc: "Full type inference from your Zod schemas. Autocomplete for queries, documents, and pagination — everywhere.",
    },
    {
        icon: "R",
        title: "Relations & Lookups",
        desc: "Declare references between collections. The ODM generates $lookup pipelines automatically from your schema.",
    },
    {
        icon: "P",
        title: "Built-in Pagination",
        desc: "Paginated queries via $facet in a single aggregation call. Page metadata included — no extra count query.",
    },
    {
        icon: "I",
        title: "Transparent id/ObjectId",
        desc: "Work with id (string) in your app, _id (ObjectId) in MongoDB. Bidirectional conversion is automatic and recursive.",
    },
];

export const Component = () => {
    return (
        <div class={css.page}>
            {/* Nav */}
            <nav class={css.nav}>
                <div class={css.navInner}>
                    <span class={css.logo}>ZodMongo</span>
                    <div class={css.navLinks}>
                        <Link to="/docs/getting-started" class={css.navLink}>Docs</Link>
                        <a href="https://github.com/mauro-andre/zodmongo" target="_blank" class={css.navLink}>GitHub</a>
                        <a href="https://www.npmjs.com/package/zodmongo" target="_blank" class={css.navLink}>npm</a>
                        <Link to="/docs/getting-started" class={css.navCta}>Get Started</Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section class={css.hero}>
                <h1 class={css.heroTitle}>ZodMongo</h1>
                <p class={css.heroTagline}>Lightweight MongoDB ODM with Zod validation</p>
                <p class={css.heroSubtitle}>
                    TypeScript-first ODM built on the native MongoDB driver. Define schemas with Zod,
                    get automatic id conversion, timestamps, pagination, and relation lookups — in ~300 lines.
                </p>
                <div class={css.heroActions}>
                    <Link to="/docs/getting-started" class={css.btnPrimary}>Get Started</Link>
                    <a href="https://github.com/mauro-andre/zodmongo" target="_blank" class={css.btnSecondary}>View on GitHub</a>
                </div>
            </section>

            {/* Install */}
            <section class={css.installSection}>
                <h2 class={css.sectionTitle}>Get started in seconds</h2>
                <code class={css.installCode}>npm install zodmongo</code>
            </section>

            {/* Features */}
            <section class={css.section}>
                <h2 class={css.sectionTitle}>Everything you need</h2>
                <p class={css.sectionSubtitle}>
                    A focused ODM that handles schemas, queries, relations, and pagination — so you can skip the boilerplate.
                </p>
                <div class={css.featuresGrid}>
                    {features.map((f, i) => (
                        <div key={i} class={css.featureCard}>
                            <span class={css.featureIcon}>{f.icon}</span>
                            <h3 class={css.featureTitle}>{f.title}</h3>
                            <p class={css.featureDesc}>{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer class={css.footer}>
                <div class={css.footerInner}>
                    <span class={css.logo}>ZodMongo</span>
                    <div class={css.footerLinks}>
                        <Link to="/docs/getting-started" class={css.footerLink}>Docs</Link>
                        <a href="https://github.com/mauro-andre/zodmongo" target="_blank" class={css.footerLink}>GitHub</a>
                        <a href="https://www.npmjs.com/package/zodmongo" target="_blank" class={css.footerLink}>npm</a>
                    </div>
                    <p class={css.footerCopyright}>&copy; 2026 Mauro André. MIT License.</p>
                </div>
            </footer>
        </div>
    );
};
