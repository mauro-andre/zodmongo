import { Scripts } from "@mauroandre/velojs";

interface RootProps {
    children: preact.ComponentChildren;
}

export const Component = ({ children }: RootProps) => {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>ZodMongo — Lightweight MongoDB ODM with Zod</title>
                <meta name="description" content="Lightweight MongoDB ODM powered by Zod schemas. TypeScript-first, built on the native MongoDB driver. No Mongoose." />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
                <Scripts />
            </head>
            <body>{children}</body>
        </html>
    );
};
