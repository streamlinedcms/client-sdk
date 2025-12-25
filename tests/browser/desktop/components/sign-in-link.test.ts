/**
 * Sign In Link Component tests
 *
 * Note: The sign-in link only appears in viewer mode when not authenticated.
 * Since tests run in authenticated mock mode, we test the component directly.
 */

import { test, expect, beforeAll } from "vitest";
import { setupTestHelpers } from "../support/sdk-helpers.js";

beforeAll(async () => {
    setupTestHelpers();
});

test("sign-in-link component can be created and renders", async () => {
    // Create the component directly
    const signInLink = document.createElement("scms-sign-in-link");
    document.body.appendChild(signInLink);

    await new Promise((r) => setTimeout(r, 100));

    const shadowRoot = signInLink.shadowRoot;
    expect(shadowRoot).not.toBeNull();

    const link = shadowRoot?.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Sign In");

    // Cleanup
    signInLink.remove();
});

test("clicking sign-in link dispatches sign-in-click event", async () => {
    const signInLink = document.createElement("scms-sign-in-link");
    document.body.appendChild(signInLink);

    await new Promise((r) => setTimeout(r, 100));

    let eventFired = false;
    signInLink.addEventListener("sign-in-click", () => {
        eventFired = true;
    });

    const link = signInLink.shadowRoot?.querySelector("a") as HTMLElement;
    link.click();

    await new Promise((r) => setTimeout(r, 50));

    expect(eventFired).toBe(true);

    // Cleanup
    signInLink.remove();
});

test("click event is prevented from default behavior", async () => {
    const signInLink = document.createElement("scms-sign-in-link");
    document.body.appendChild(signInLink);

    await new Promise((r) => setTimeout(r, 100));

    let defaultPrevented = false;
    signInLink.addEventListener("click", (e) => {
        defaultPrevented = e.defaultPrevented;
    });

    const link = signInLink.shadowRoot?.querySelector("a") as HTMLElement;
    link.click();

    await new Promise((r) => setTimeout(r, 50));

    // The component calls preventDefault on the click event
    expect(defaultPrevented).toBe(true);

    // Cleanup
    signInLink.remove();
});
