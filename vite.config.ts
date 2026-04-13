import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    plugins: [
        dts({ tsconfigPath: "./tsconfig.build.json" }),
    ],
    build: {
        lib: {
            entry: {
                index: "src/index.ts",
                schema: "src/schema.ts",
            },
            formats: ["es"],
        },
        rollupOptions: {
            external: ["mongodb", "zod", "zod/v4"],
        },
    },
});
