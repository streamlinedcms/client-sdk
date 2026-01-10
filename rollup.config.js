import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
import { readFileSync, existsSync } from "fs";

// Read version from env var (for CI) or package.json
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const SDK_VERSION = process.env.SDK_VERSION || pkg.version;

// Load environment variables from .env file
// SDK always builds with production values; use data-api-url in HTML to override
function loadEnvFile(filename) {
    if (!existsSync(filename)) {
        throw new Error(`Missing ${filename} - create it with SDK_API_URL and SDK_APP_URL`);
    }

    const env = {};
    const content = readFileSync(filename, "utf-8");
    for (const line of content.split("\n")) {
        const match = line.match(/^([^=#]+)=(.*)$/);
        if (match) {
            env[match[1].trim()] = match[2].trim();
        }
    }
    return env;
}

const env = loadEnvFile(".env");

// Require SDK URLs to be defined
const SDK_API_URL = env.SDK_API_URL;
const SDK_APP_URL = env.SDK_APP_URL;

if (!SDK_API_URL || !SDK_APP_URL) {
    const missing = [];
    if (!SDK_API_URL) missing.push("SDK_API_URL");
    if (!SDK_APP_URL) missing.push("SDK_APP_URL");
    throw new Error(`Missing required variables in .env: ${missing.join(", ")}`);
}

// Replace plugin config - substitutes build-time constants
const replacePlugin = replace({
    preventAssignment: true,
    values: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        __SDK_API_URL__: JSON.stringify(SDK_API_URL),
        __SDK_APP_URL__: JSON.stringify(SDK_APP_URL),
        __SDK_VERSION__: JSON.stringify(SDK_VERSION),
    },
});

// Terser plugin config - minification with preserved class names
const terserPlugin = terser({
    keep_classnames: true,
    keep_fnames: true,
});

// PostCSS plugin config - processes Tailwind CSS and injects as string
// Note: shadowDomFix plugin is configured in postcss.config.cjs to run after Tailwind
const postcssPlugin = postcss({
    inject: false, // Don't inject into DOM, we handle it manually
    minimize: true, // Minify the output
});

export default [
    // Sync loader - unminified
    {
        input: "src/loader.ts",
        output: {
            file: "dist/streamlined-cms.js",
            format: "iife",
            sourcemap: true,
        },
        plugins: [
            replacePlugin,
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: false,
                declarationMap: false,
            }),
        ],
    },
    // Sync loader - minified
    {
        input: "src/loader.ts",
        output: {
            file: "dist/streamlined-cms.min.js",
            format: "iife",
            sourcemap: true,
        },
        plugins: [
            replacePlugin,
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: false,
                declarationMap: false,
            }),
            terserPlugin,
        ],
    },
    // ESM bundle - unminified (with code splitting for lazy-loaded tours)
    {
        input: "src/lazy/index.ts",
        output: {
            dir: "dist",
            format: "es",
            sourcemap: true,
            entryFileNames: "streamlined-cms.esm.js",
            chunkFileNames: "streamlined-cms.[name].js",
        },
        plugins: [
            replacePlugin,
            nodeResolve(),
            postcssPlugin,
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: true,
                declarationDir: "./dist",
            }),
        ],
    },
    // ESM bundle - minified (with code splitting for lazy-loaded tours)
    {
        input: "src/lazy/index.ts",
        output: {
            dir: "dist",
            format: "es",
            sourcemap: true,
            entryFileNames: "streamlined-cms.esm.min.js",
            chunkFileNames: "streamlined-cms.[name].min.js",
        },
        plugins: [
            replacePlugin,
            nodeResolve(),
            postcssPlugin,
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: false,
                declarationMap: false,
            }),
            terserPlugin,
        ],
    },
];
