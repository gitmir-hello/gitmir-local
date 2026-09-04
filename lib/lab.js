// The laboratory: where the model lives now.
//
// This tool used to build and keep a model on your disk. It no longer does. The
// model is built and kept by the laboratory, and reached over MCP — the same way
// your assistant reaches it. Everything here that needs a model asks the
// laboratory; everything that does not keeps working with no account at all.
//
// That split is deliberate and worth stating, because half of this tool is
// useful on its own: the task queue, the findings, the audits that walk a running
// application. None of those need a model. Turning the whole tool into a login
// screen would have been the easy way to sell the laboratory and the fast way to
// lose the people who have not bought it yet.

const HOME = 'https://lab.gitmir.com';

/** Where the model lives, and where a person goes to get one. */
export const lab = () => ({
  home: HOME,
  signIn: HOME + '/login',
  signUp: HOME + '/signup',
  mcp: HOME + '/mcp',
  keys: HOME + '/account/access',
});

/** The key this machine was given, or null. Read from the environment: `GITMIR_LAB_KEY`. */
export const key = () => (process.env.GITMIR_LAB_KEY || '').trim() || null;

/**
 * Is a laboratory key set on this machine?
 *
 * The one place the whole client asks. Every screen, every tool and every line of
 * text that says anything about the laboratory reads this and nothing else —
 * private copies of the same question are how one answer ends up contradicting
 * another inside a single reply.
 *
 * It answers about the key and only about the key. We deliberately do not probe
 * the network here: a slow or offline check would make every screen that merely
 * wants to say "no key yet" wait for a timeout. So the wording built on it must
 * not promise more than a key — whether the laboratory actually answers is known
 * only once something asks it, and `view()` and `ask()` report that separately.
 */
export const connected = () => key() !== null;

/**
 * The answer every model-shaped surface gives until the laboratory is connected.
 *
 * One shape, one wording, one place to change it. Scattered copies of "no model
 * here" drift into four different explanations of the same situation, and the
 * person reading the fourth one concludes the tool is broken.
 */
export function needsLab(what = 'This') {
  return {
    lab: lab(),
    connected: false,
    error: what + ' comes from the laboratory, and this machine is not connected to one yet.',
    how: [
      'The model of a product is built and kept at ' + HOME + ' — not on this machine.',
      'Sign in (or sign up) there, open MCP access, copy the key, and set it as '
        + 'GITMIR_LAB_KEY in the environment this tool starts in.',
      'Everything here that does not need a model keeps working without it: the task '
        + 'queue, findings, and the audits that walk a running application.',
    ],
  };
}

/**
 * Read a projection the viewer can draw from.
 *
 * MCP answers in text, because an agent reads it. A picture needs shape, and the
 * laboratory serves the same projection in a machine-readable form on its own
 * path: names, business words, handles. Nothing more than the text already says —
 * which is the point, and the reason a viewer can exist at all without the model
 * ever being on this machine.
 */
export async function view(what, params = {}) {
  const k = key();
  if (!k) return needsLab();
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(lab().home + '/view/' + what + (qs ? '?' + qs : ''), {
      headers: { authorization: 'Bearer ' + k },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { connected: true, error: (body && body.error) || ('the laboratory answered ' + res.status),
        lab: lab() };
    }
    return { connected: true, ...body };
  } catch (e) {
    return { connected: true, error: 'The laboratory is not answering: ' + String(e?.message || e),
      lab: lab() };
  }
}

/**
 * Ask the laboratory something over MCP.
 *
 * Deliberately thin and deliberately unfinished: the tools it will call
 * (the map, an area, the neighbours of a handle, findings, the task queue) do not
 * exist on the laboratory side yet. Until they do, every caller gets `needsLab`
 * and says so on screen rather than pretending.
 */
export async function ask(tool, args = {}) {
  const k = key();
  if (!k) return needsLab();
  try {
    const res = await fetch(lab().mcp, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: tool, arguments: args },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { connected: true, error: (body && body.error && body.error.message)
        || ('the laboratory answered ' + res.status), lab: lab() };
    }
    const text = body?.result?.content?.[0]?.text;
    return { connected: true, text: typeof text === 'string' ? text : '', raw: body?.result || null };
  } catch (e) {
    // "Not answering" and "refused" are different news, and the screen needs the
    // first one — otherwise the reader looks for the fault on their own machine.
    return { connected: true, error: 'The laboratory is not answering: ' + String(e?.message || e),
      lab: lab() };
  }
}
