import { useLoader, usePathname } from "@mauroandre/velojs/hooks";
import type { LoaderArgs } from "@mauroandre/velojs";
import { Link } from "@mauroandre/velojs";
import { useSignal } from "@preact/signals";
import * as css from "./Layout.css.js";

interface DocEntry {
    slug: string;
    title: string;
    order: number;
    filename: string;
}

export const loader = async ({}: LoaderArgs) => {
    const { default: manifest } = await import("virtual:docs-manifest");
    return { manifest: manifest as DocEntry[] };
};

export const Component = ({ children }: { children: any }) => {
    const sidebarOpen = useSignal(false);
    const pathname = usePathname();
    const { data } = useLoader<{ manifest: DocEntry[] }>([pathname]);

    const entries = data.value?.manifest ?? [];

    return (
        <div class={css.layout}>
            {/* Mobile toggle */}
            <button
                class={css.mobileToggle}
                onClick={() => (sidebarOpen.value = !sidebarOpen.value)}
            >
                {sidebarOpen.value ? "\u2715" : "\u2630"}
            </button>

            {/* Sidebar */}
            <aside class={`${css.sidebar} ${sidebarOpen.value ? css.sidebarVisible : ""}`}>
                <div class={css.sidebarHeader}>
                    <Link to="~/" class={css.sidebarLogo}>ZodMongo</Link>
                </div>

                <nav class={css.sidebarNav}>
                    {entries.map((entry) => (
                        <Link
                            key={entry.slug}
                            to={`/${entry.slug}`}
                            class={`${css.sidebarLink} ${pathname === `/docs/${entry.slug}` ? css.sidebarLinkActive : ""}`}
                        >
                            {entry.title}
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* Content */}
            <main class={css.content}>
                {children}
            </main>
        </div>
    );
};
