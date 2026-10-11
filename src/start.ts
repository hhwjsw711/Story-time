import { createStart } from "@tanstack/react-start";

// SSR is off app-wide: routes render in the browser. The shell and the root
// route's head() still render on the server, for link previews and the
// no-flash theme script.
export const startInstance = createStart(() => ({ defaultSsr: false }));
