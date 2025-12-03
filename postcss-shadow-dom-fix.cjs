/**
 * PostCSS plugin to extract @property initial values for Shadow DOM compatibility.
 *
 * Tailwind v4 uses @property declarations with `inherits: false`, which don't
 * work in Shadow DOM. This plugin extracts those declarations and generates
 * a *, ::before, ::after rule that sets the initial values explicitly.
 */

const postcss = require("postcss");

const { Rule, Declaration, AtRule } = postcss;

/**
 * @type {import('postcss').PluginCreator}
 */
const shadowDomFix = () => {
    return {
        postcssPlugin: "postcss-shadow-dom-fix",
        Once(root) {
            const propertyDefaults = new Map();

            // Walk through all @property rules and extract initial-value
            root.walkAtRules("property", (atRule) => {
                const propertyName = atRule.params; // e.g., "--tw-border-style"

                atRule.walkDecls("initial-value", (decl) => {
                    propertyDefaults.set(propertyName, decl.value);
                });
            });

            if (propertyDefaults.size === 0) {
                return;
            }

            // Create the rule with all property defaults
            const rule = new Rule({
                selector: "*, ::before, ::after",
                source: root.source,
            });

            for (const [name, value] of propertyDefaults) {
                rule.append(
                    new Declaration({
                        prop: name,
                        value: value,
                    })
                );
            }

            // Find or create @layer base and append the rule
            let baseLayer = null;
            root.walkAtRules("layer", (atRule) => {
                if (atRule.params === "base") {
                    baseLayer = atRule;
                }
            });

            if (baseLayer) {
                baseLayer.append(rule);
            } else {
                // Create @layer base if it doesn't exist
                const layer = new AtRule({
                    name: "layer",
                    params: "base",
                });
                layer.append(rule);
                root.prepend(layer);
            }
        },
    };
};

shadowDomFix.postcss = true;

module.exports = shadowDomFix;
