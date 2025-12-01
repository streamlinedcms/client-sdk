/**
 * Shared Tailwind stylesheet for Shadow DOM components
 *
 * This creates a constructable stylesheet from compiled Tailwind CSS
 * that can be adopted by multiple shadow roots.
 */

import { unsafeCSS, type CSSResult } from "lit";
// rollup-plugin-postcss exports CSS as default string
import tailwindStyles from "./tailwind.css";

// Create a Lit-compatible CSS result from the Tailwind styles
export const tailwindSheet: CSSResult = unsafeCSS(tailwindStyles);
