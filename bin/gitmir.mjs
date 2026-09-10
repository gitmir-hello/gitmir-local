#!/usr/bin/env node
// The `gitmir` command.
//
// Written in Node rather than shell because Node is already the one hard
// requirement, and a launcher written twice — once in bash, once in PowerShell —
// is a launcher fixed twice and fixed differently. This file is the whole
// implementation; the shims beside it just call into it.
//
// It starts nothing you could not start yourself: `node server.ts` in the
// install directory is the program. This exists so nobody has to remember where
// that directory is.

import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// realpath, because on POSIX this is reached through a symlink on the PATH and
// the launcher has to find the checkout it belongs to, not the bin directory.
const DIR = path.dirname(fs.realpathSync(HERE));
const STATE = process.env.GITMIR_STATE || path.join(os.homedir(), '.gitmir');
const PORT = Number(process.env.GITMIR_PORT || 4599);
const LOG = path.join(STATE, 'server.log');
const PIDF = path.join(STATE, 'server.pid');

const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (...a) => console.log('  ' + a.join(' '));
const die = (msg) => { console.error(`\n  ${c('1;31', '✕')} ${msg}\n`); process.exit(1); };

fs.mkdirSync(STATE, { recursive: true });

// --- is it up ----------------------------------------------------------------
// The port is the honest test. A pid file survives a crash and would claim a
// server that is not there; a server someone started by hand has no pid file.
function listening(port = PORT, ms = 350) {
  return new Promise((res) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const done = (v) => { s.destroy(); res(v); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), ms);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function nodeOk() {
  const [maj, min] = process.versions.node.split('.').map(Number);
  return maj > 22 || (maj === 22 && min >= 18);
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
}

/**
 * Run the Claude CLI.
 *
 * On Windows it is a .cmd shim, and execFileSync cannot execute those — it fails
 * with ENOENT, which the caller would report as "claude is not on your PATH"
 * while `gitmir status` says it is, using `where`. Two of our own screens
 * contradicting each other is a worse failure than the one being reported.
 *
 * Candidates rather than a shell, so a path with a space in it stays one argument.
 */
/* Where Codex actually is.
 *
 * On macOS it ships inside ChatGPT.app and is usually not on the PATH: `which
 * codex` says no while the binary sits in the bundle. Telling somebody it is not
 * installed when it is sends them to download what they already have. */
const CODEX_IN_APP = '/Applications/ChatGPT.app/Contents/Resources/codex';
/* Where Codex keeps its config, spelled the way this machine spells it.
 * `~/.codex/config.toml` is right on macOS and Linux and wrong on Windows, where a
 * person reading it goes looking for a tilde. Same file either way. */
const CODEX_CONF = path.join(os.homedir(), '.codex', 'config.toml');
function codexBin() {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], { stdio: 'ignore' }); return 'codex'; }
  catch { /* not on PATH — look where the app puts it */ }
  if (process.platform === 'darwin' && fs.existsSync(CODEX_IN_APP)) return CODEX_IN_APP;
  return null;
}

function runAgent(bin, args, opts = {}) {
  if (process.platform !== 'win32') return execFileSync(bin, args, opts);
  const quote = (a) => (/[\s"^&|<>()%!]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a);
  const line = [bin, ...args.map(quote)].join(' ');
  return execFileSync('cmd.exe', ['/d', '/s', '/c', `"${line}"`],
    { ...opts, windowsVerbatimArguments: true });
}

function runClaude(args, opts = {}) {
  if (process.platform !== 'win32') return execFileSync('claude', args, opts);

  // On Windows the Claude CLI is claude.cmd, and since the 2024 command-injection
  // fix Node refuses to execFile a .cmd at all — it fails with EINVAL rather than
  // running it. Reported from a real machine as `spawnSync claude.cmd EINVAL`.
  //
  // So it has to go through cmd.exe, which means the quoting is ours to get right:
  // with shell:true Node escapes nothing, and a Windows home directory is one
  // space away from being two arguments.
  // Not `shell: true`: Node deprecated passing args that way (DEP0190) precisely
  // because it concatenates without escaping, and it prints that warning at the
  // user. Call cmd.exe outright with one command line we quoted ourselves, and
  // tell Node not to re-quote it on the way past.
  const quote = (a) => (/[\s"^&|<>()%!]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a);
  const line = ['claude', ...args.map(quote)].join(' ');
  // /d skips AutoRun scripts, /s makes cmd strip exactly the outer pair of quotes.
  return execFileSync('cmd.exe', ['/d', '/s', '/c', `"${line}"`],
    { ...opts, windowsVerbatimArguments: true });
}

function git(args, opts = {}) {
  // stderr silenced: `status` asks git for a version it may not have, and
  // "fatal: not a git repository" printed above a clean report reads as a crash.
  return execFileSync('git', ['-C', DIR, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
}

// --- commands ----------------------------------------------------------------

// Node refuses to strip TypeScript types for anything under node_modules, so a
// global npm install cannot host the runtime — the server dies on the first
// import with a stack trace nobody should have to read. Say the actual thing.
const IN_NODE_MODULES = DIR.includes(`${path.sep}node_modules${path.sep}`);
function refuseNodeModules() {
  if (!IN_NODE_MODULES) return;
  die(`This copy lives under node_modules, and Node will not run TypeScript from there
    (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING) — which is what lets this project
    have no build step at all.

    Install it the way it expects instead:
      curl -fsSL https://ide.gitmir.com/install.sh | sh

    Then: npm rm -g gitmir-local`);
}

async function start() {
  refuseNodeModules();
  if (!nodeOk()) {
    die(`Node ${process.versions.node} is too old — this runs TypeScript with no build step, which needs 22.18 or newer.`);
  }
  if (await listening()) {
    say(c('0;36', 'Already running') + ` — http://localhost:${PORT}`);
    openBrowser(`http://localhost:${PORT}`);
    return;
  }
  const out = fs.openSync(LOG, 'a');
  const child = spawn(process.execPath, ['server.ts'], {
    cwd: DIR, detached: true, stdio: ['ignore', out, out],
    env: { ...process.env, GITMIR_PORT: String(PORT) },
  });
  child.unref();
  fs.writeFileSync(PIDF, String(child.pid));

  for (let i = 0; i < 60; i++) {
    if (await listening()) break;
    await wait(250);
  }
  if (!(await listening())) {
    console.error(`\n  ${c('1;31', '✕')} the server did not come up. Its log:\n`);
    try { console.error(fs.readFileSync(LOG, 'utf8').split('\n').slice(-20).map((l) => '    ' + l).join('\n')); } catch {}
    console.error('');
    process.exit(1);
  }
  console.log(`\n  ${c('1;36', 'GitMir Local')}  http://localhost:${PORT}`);
  say(`log: ${LOG}   ·   stop with: gitmir stop`);
  console.log('');
  openBrowser(`http://localhost:${PORT}`);
}

/* Who holds the port, asked of the operating system.
 *
 * The same reason the pid file is not the liveness test is the reason it is not
 * the identity test either: it outlives whatever wrote it, and the system reuses
 * pid numbers, so a file left by a crash names a stranger's process about as
 * readily as ours. */
function portOwners(port = PORT) {
  try {
    const out = process.platform === 'win32'
      ? execFileSync('cmd', ['/c', `netstat -ano | findstr LISTENING | findstr :${port}`], { encoding: 'utf8' })
      : execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
    // netstat prints whole rows and lsof -t prints bare pids; in both, the only
    // standalone integers are pids — an address always carries its colon.
    return String(out).trim().split(/\s+/)
      .filter((t) => /^\d+$/.test(t)).map(Number).filter((n) => n > 0);
  } catch { return []; }
}

/* Does this pid still look like our server?
 *
 * Only used where the port could not be traced (a machine with no lsof). It is
 * the difference between killing a pid because a file said so and killing it
 * because the process is the one the file claims. */
function looksLikeServer(pid) {
  if (!pid) return false;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/fi', `PID eq ${pid}`, '/nh'], { encoding: 'utf8' });
      return /node\.exe/i.test(out);
    }
    return /server\.ts/.test(execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }));
  } catch { return false; }
}

async function stop({ quiet = false } = {}) {
  if (!(await listening())) { if (!quiet) say('Not running.'); return; }
  let noted = 0;
  try { noted = Number(fs.readFileSync(PIDF, 'utf8').trim()) || 0; } catch {}
  const owners = portOwners();
  // The port decides who dies; the pid file only breaks a tie when several
  // processes hold it (macOS lists one per address family).
  let pid = owners.includes(noted) ? noted : owners[0] || 0;
  if (!pid && looksLikeServer(noted)) pid = noted;
  if (!pid) {
    // The pid file is either stale or about somebody else. Either way it is not
    // evidence, so drop it rather than leave it to mislead the next run.
    try { fs.unlinkSync(PIDF); } catch {}
    die(`Something is serving port ${PORT} and I cannot tell what.\n    Stop it yourself, or set GITMIR_PORT.`);
  }
  try { process.kill(pid); }
  catch (e) {
    if (e.code === 'EPERM') die(`Port ${PORT} is held by process ${pid}, which belongs to another user.\n    Stop it yourself, or set GITMIR_PORT.`);
    // ESRCH: it went away between the lookup and the signal. The port check below
    // is the answer either way.
  }
  // SIGTERM is a request, not an event. Saying "Stopped." before the port frees
  // is exactly the lie this command used to tell.
  for (let i = 0; i < 40 && (await listening()); i++) await wait(100);
  if (await listening()) {
    die(`Asked process ${pid} to stop, but port ${PORT} is still being served.\n    Look at it with:  ${process.platform === 'win32' ? `netstat -ano | findstr :${PORT}` : `lsof -nP -iTCP:${PORT} -sTCP:LISTEN`}`);
  }
  try { fs.unlinkSync(PIDF); } catch {}
  say('Stopped.');
}

async function update() {
  if (!fs.existsSync(path.join(DIR, '.git'))) {
    // Installed by npm, or from a tarball: there is no history to pull. Point at
    // whichever route actually put it here rather than at the one we prefer.
    const viaNpm = DIR.includes(`${path.sep}node_modules${path.sep}`);
    // Not "npm i -g" again: that is the route refuseNodeModules() exists to turn
    // people away from, because Node will not strip types under node_modules.
    // Sending them back into it would be advising the one state that cannot work.
    die(viaNpm
      ? `Installed through npm, so there is no git history here to pull — and Node cannot run\n    TypeScript from under node_modules anyway.\n\n    Install it the way it expects instead:\n      curl -fsSL https://ide.gitmir.com/install.sh | sh\n\n    Then: npm rm -g gitmir-local`
      : `${DIR} is not a git checkout — there is no history here to pull.\n    Update by running the installer again:\n      curl -fsSL https://ide.gitmir.com/install.sh | sh`);
  }
  say(`Updating ${DIR}`);
  const before = git(['rev-parse', '--short', 'HEAD']).trim();
  // stderr piped for this one call: git says why it refused — no upstream,
  // diverged histories, local edits — and it says it on stderr. Without it every
  // failure reads as the same "Command failed: git … pull --ff-only".
  try { console.log(git(['pull', '--ff-only'], { stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').map((l) => '  ' + l).join('\n')); }
  catch (e) {
    // Six lines: enough that git's own suggested command survives the cut, which
    // is the line the person is going to run next.
    const why = String(e.stderr || e.message || e).trim().split('\n').filter((l) => l.trim()).slice(0, 6);
    die(`git pull failed:\n${why.map((l) => '    ' + l).join('\n')}`);
  }
  const after = git(['rev-parse', '--short', 'HEAD']).trim();
  if (before === after) { say('Already current.'); return; }
  if (await listening()) {
    say('Restarting the running server so it picks this up.');
    await stop({ quiet: true });
    await wait(800);
    await start();
  }
}

function mcpConfig() {
  return JSON.stringify({
    mcpServers: { gitmir: { command: 'node', args: [path.join(DIR, 'mcp.ts')] } },
  }, null, 2);
}

/* The same server, spelled the way Codex reads it.
 *
 * Two differences that are not cosmetic, and both come from Codex having no
 * notion of scope:
 *
 *   - `--project` is passed explicitly. Claude Code starts the server with the
 *     open folder as its working directory, which is why the registration there
 *     can stay project-agnostic. Codex offers no scope flag and no `--cwd` on
 *     the command line, so a registration without `--project` would answer about
 *     whatever directory Codex happened to start in. Pinning it is the honest
 *     option: one registration, one repository, and it says so.
 *   - the timeouts are written down. Codex's documented defaults and its
 *     compiled-in defaults disagree by a factor of five; a first build on a
 *     large repository is exactly the thing that runs past the smaller number.
 */
function codexConfig(project) {
  const q = (s) => JSON.stringify(String(s));
  return [
    '[mcp_servers.gitmir]',
    'command = "node"',
    `args = [${q(path.join(DIR, 'mcp.ts'))}, "--project", ${q(project)}]`,
    'startup_timeout_sec = 30',
    'tool_timeout_sec = 120',
  ].join('\n');
}

/* Which agent, and does it exist here.
 *
 * Written as one place rather than three `if`s, because the two clients differ in
 * more than a binary name: what registers them, where that lands, whether a project
 * can be pinned, and — the part people get bitten by — whether the eight skills
 * arrive as slash commands or only as tools. */
function agent(which) {
  if (which === 'codex') {
    return {
      id: 'codex', label: 'Codex', bin: codexBin(),
      list: 'codex mcp list',
      slashCommands: false,
    };
  }
  return { id: 'claude', label: 'Claude Code', bin: 'claude', list: 'claude mcp list', slashCommands: true };
}

function mcpCodex(sub) {
  const a = agent('codex');
  const project = process.cwd();
  if (!a.bin) {
    die('Codex is not on this machine.\n'
      + '    Looked on the PATH and in /Applications/ChatGPT.app.\n\n'
      + `    Add it by hand instead — put this in ${CODEX_CONF}:\n\n`
      + codexConfig(project).split('\n').map((l) => '      ' + l).join('\n') + '\n');
  }
  if (sub === 'add-here') {
    // Codex's own registration is global, so "here" means the project-scoped file
    // it reads in a trusted project. Writing that file is the whole job.
    const file = path.join(project, '.codex', 'config.toml');
    let existing = '';
    try { existing = fs.readFileSync(file, 'utf8'); } catch { /* first time */ }
    if (existing.includes('[mcp_servers.gitmir]')) {
      say(`${c('0;36', 'Already there')} — .codex/config.toml in this folder registers gitmir.`);
      say(`To repoint it, edit ${file}`);
      console.log('');
      return;
    }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, (existing ? existing.replace(/\s*$/, '') + '\n\n' : '') + codexConfig(project) + '\n');
    } catch (e) { die(`Could not write ${file}:\n    ${String(e.message || e)}`); }
    console.log('');
    say(`Wrote ${c('0;36', '.codex/config.toml')} in ${project}.`);
    say('Codex reads it in a trusted project.');
    // Both paths in that file — the checkout and --project — are absolute and
    // belong to this machine. Committing it hands a teammate a server that cannot
    // start, so promise them the command, not the file.
    say('The paths in it are this machine\'s, so a teammate runs the same command in their');
    say(`own checkout: ${c('0;36', 'gitmir mcp add-here --codex')}`);
  } else {
    const args = ['mcp', 'add', 'gitmir', '--', 'node', path.join(DIR, 'mcp.ts'), '--project', project];
    try {
      console.log(runAgent(a.bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
    } catch (e) {
      const said = `${e.stdout || ''}${e.stderr || ''}`.trim();
      if (/already/i.test(said)) {
        say(`${c('0;36', 'Already registered')} — gitmir is in ${CODEX_CONF}.`);
        say('To repoint it:  codex mcp remove gitmir  then run this again from the repository you want.');
        console.log('');
        return;
      }
      die(`codex could not register it:\n    ${said.split('\n')[0] || String(e.message || e)}\n\n`
        + `    Put this in ${CODEX_CONF} yourself — it is the same registration:\n\n`
        + codexConfig(project).split('\n').map((l) => '      ' + l).join('\n') + '\n');
    }
    console.log('');
    say(`Registered in ${c('0;36', CODEX_CONF)}, pinned to ${project}.`);
    // The limitation, said before they discover it the hard way.
    say('Codex has no per-project scope, so this answers about THAT folder and no other.');
    say(`For a second repository: ${c('0;36', 'cd <repo> && gitmir mcp add-here --codex')}`);
  }
  console.log('');
  say(`${c('1;37', 'Restart Codex')} — a client reads its MCP config once, at startup.`);
  say(`Then say: ${c('0;36', 'set this project up with GitMir')}`);
  // The one real functional difference. Promising slash commands here would be a lie.
  say('Codex does not implement MCP prompts, so the eight skills arrive as tools rather than');
  say(`slash commands — the agent reaches them with ${c('0;36', 'gitmir_skills')} and ${c('0;36', 'gitmir_skill')}.`);
  say('Nothing is lost: the server says so in its own instructions at startup.');
  console.log('');
}

function mcp(sub, flag) {
  // Registering with the agent is where people got stuck: an MCP server has no
  // screen, so a config that never took looks exactly like one that did.
  // Which agent. Claude Code stays the default because it is what the install
  // instructions have always said; Codex is a flag rather than a second command
  // so the two paths cannot drift apart.
  const codex = flag === '--codex' || sub === '--codex' || sub === 'codex';
  if (codex && (sub === 'add' || sub === 'add-here')) return mcpCodex(sub);
  if (codex) {
    console.log(`\n  Put this in ${CODEX_CONF}:\n`);
    console.log(codexConfig(process.cwd()).split('\n').map((l) => '    ' + l).join('\n'));
    console.log(`\n  Or, if Codex is on this machine:  ${c('0;36', 'gitmir mcp add --codex')}\n`);
    return;
  }
  if (sub === 'add' || sub === 'add-here') {
    // `claude mcp add` defaults to local scope — the registration lives in the
    // directory you happened to run it from. Somebody who runs this once, from
    // anywhere, and then opens their editor in a project finds nothing there and
    // reasonably concludes it did not work.
    //
    //   add       -> user scope: every project, answering about whichever one the
    //               editor was opened in, because the server falls back to its cwd.
    //   add-here  -> project scope: writes .mcp.json into this folder, so the
    //               registration belongs to the repository rather than to
    //               wherever the command was typed. The path inside it is still
    //               this machine's, so it is not a registration for teammates.
    const scope = sub === 'add-here' ? 'project' : 'user';
    const args = ['mcp', 'add', '-s', scope, 'gitmir', '--', 'node', path.join(DIR, 'mcp.ts')];
    try {
      console.log(runClaude(args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
    } catch (e) {
      // Every failure used to report the same cause — "claude is not on your PATH" —
      // including the common one where it is on the PATH and the server is simply
      // already registered. Being told the wrong reason is worse than being told
      // nothing: it sends somebody to fix a thing that is not broken.
      const said = `${e.stdout || ''}${e.stderr || ''}`.trim();
      if (e.code === 'ENOENT') {
        die("The 'claude' CLI is not on your PATH.\n    Run `gitmir mcp` and paste the config into your editor's MCP settings instead.");
      }
      if (/already exists/i.test(said)) {
        say(`${c('0;36', 'Already registered')} — gitmir is in your ${scope} config.`);
        say(`Pointing at: ${path.join(DIR, 'mcp.ts')}`);
        say(`To repoint it at this checkout:  claude mcp remove -s ${scope} gitmir && gitmir mcp${sub === 'add-here' ? ' add-here' : ' add'}`);
        console.log('');
        say('Check what it resolves to now:  claude mcp list');
        console.log('');
        return;
      }
      // Whatever went wrong, leave the person with something they can run. The
      // command below is what this function was trying to do, in a form they can
      // paste into their own shell where the quoting is the shell's problem.
      const manual = `claude mcp add -s ${scope} gitmir -- node "${path.join(DIR, 'mcp.ts')}"`;
      die(`claude could not register it:\n    ${said.split('\n')[0] || String(e.message || e)}\n\n` +
          `    Run this yourself — it is the same registration:\n      ${manual}`);
    }
    console.log('');
    if (scope === 'user') {
      say('Added for every project. The server answers about whichever folder your editor is open in.');
      say(`To pin it to one repository instead: ${c('0;36', 'gitmir mcp add-here')}`);
    } else {
      say(`Added to .mcp.json in ${process.cwd()}.`);
      // The file names this checkout by absolute path. A teammate who commits it
      // and opens the project gets a server that cannot start — better said here
      // than discovered as a silent MCP failure with no screen to show it.
      say(`It points at ${path.join(DIR, 'mcp.ts')}, a path that exists on this machine,`);
      say(`so a teammate runs ${c('0;36', 'gitmir mcp add-here')} in their own checkout.`);
    }
    console.log('');
    say(`${c('1;37', 'Restart your editor')} — a client reads its MCP config once, at startup.`);
    say(`Then say: ${c('0;36', 'set this project up with GitMir')}`);
    say(`All eight skills arrive as slash commands; nothing has to be pasted.`);
    console.log('');
    return;
  }
  console.log("\n  Point your editor's MCP settings at this:\n");
  console.log(mcpConfig().split('\n').map((l) => '    ' + l).join('\n'));
  console.log(`\n  Or, with the Claude Code CLI:  ${c('0;36', 'gitmir mcp add')}\n`);
}

/**
 * Prepare a project through the MCP server, and print what the server said.
 *
 * The long form is `cd <checkout> && node mcp-check.ts <project> setup`, which is
 * three things to get right in a line somebody is copying while already unsure
 * whether anything works. This is the same call with the paths filled in.
 *
 * It asks for `setup` rather than for the model: the model is not on this machine
 * and never will be — it lives in Intelligence — so asking for it printed
 * "Unknown tool" at the very person checking a working install. `setup` answers
 * with what the install can actually do, and names what it is still missing.
 *
 * Setup writes: it creates the task folders in the project and adds the project
 * to the dashboard's list. That is the point of it, and the help says so — a
 * command that quietly writes while calling itself a question is worse than one
 * that writes and admits it.
 */
function check(arg) {
  const project = path.resolve(arg || process.cwd());
  if (!fs.existsSync(project)) die(`No such folder: ${project}`);
  say(`Setting ${project} up, and asking what is still missing.`);
  say('This writes: the task folders in that project, and an entry in the dashboard.');
  console.log('');
  try {
    execFileSync(process.execPath, ['mcp-check.ts', project, 'setup'], { cwd: DIR, stdio: 'inherit' });
  } catch {
    die('The check did not run. `gitmir status` will say whether Node is new enough.');
  }
}

/* ---------------------------------------------------------------------------
 * Intelligence: ключ и подключение по MCP
 * ------------------------------------------------------------------------ */

/* Ключи этой машины для `gitmir lab status`: последние четыре знака и кто каким
 * пользуется. Самого ключа здесь нет — терминалы попадают в скриншоты. */
function keysStatus(L) {
  const list = L.keys();
  const file = path.join(STATE, 'lab.json');
  console.log('');
  const wanted = (process.env.GITMIR_LAB_URL || '').trim();
  if (wanted) {
    let origin = '';
    try { origin = new URL(wanted).origin; } catch {}
    // Адрес, который не прошёл правило, не берётся; сказать об этом здесь, а не по «bad key».
    say(origin === L.lab().home ? `Intelligence at ${L.lab().home} (GITMIR_LAB_URL)`
      : `${c('0;33', 'GITMIR_LAB_URL is not used')}: it must be https, or http only on 127.0.0.1. Intelligence at ${L.lab().home}`);
  }
  if (!list.length) return;
  say('Keys on this machine, by their last four characters:');
  const usedBy = (u) => u.length === 2 ? 'assistants (/mcp and /view) and the Local Connector'
    : u[0] === 'assistants' ? 'assistants (/mcp and /view)'
    : u[0] === 'connector' ? 'the Local Connector'
    : 'nothing: the environment variable wins';
  for (const k of list) {
    const what = (k.kind === 'agent' ? 'agent key' : 'personal key')
      + (k.source === 'environment' ? `, from ${k.name}` : `, saved in ${file}`);
    say(`  …${k.last4}  ${what}  →  ${usedBy(k.uses)}`);
  }
  if (!list.some((k) => k.kind === 'personal')) say(L.PERSONAL_KEY_NEEDED);
  else if (!list.some((k) => k.kind === 'agent')) {
    say('Assistants use your personal key. An agent key is made on a project or repository and reads only that place:');
    say(`  ${c('0;36', 'gitmir lab add --project <id> --key <agent key>')}`);
  }
}

/**
 * Подключить эту машину к Intelligence и прописать его ассистенту.
 *
 * До сих пор подключиться было нечем. Ключ читался только из переменной
 * окружения, а сама переменная не упоминалась ни на одном экране и ни в одном
 * документе: человек, скачавший клиент, видел «Intelligence не подключён» и не
 * имел ни одного способа это изменить.
 *
 * Ключ сюда попадает один раз и ложится в домашнюю папку, а не в репозиторий:
 * он даёт право читать модель продукта, а репозитории коммитят и показывают.
 */
async function labCmd(argv) {
  const L = await import(path.join(DIR, 'lib', 'lab.js'));

  /* --project разбирается первым и проверяется раньше всего остального: неверный
   * id — отказ до того, как что-то сохранено или прописано у ассистента. */
  const rest = [];
  let project = null;
  let agentKey = null;
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === '--project') { project = argv[++i] ?? ''; continue; }
    if (a.startsWith('--project=')) { project = a.slice('--project='.length); continue; }
    if (a === '--key') { agentKey = argv[++i] ?? ''; continue; }
    if (a.startsWith('--key=')) { agentKey = a.slice('--key='.length); continue; }
    rest.push(a);
  }
  const sub = rest[0];
  let address = null;
  if (project !== null) {
    if (sub !== 'add' && sub !== 'add-here') {
      die('--project goes with `gitmir lab add` or `gitmir lab add-here`.');
    }
    try { address = L.lab().mcpFor(project); }
    catch (e) { die(`${String(e.message || e)}\n    \`gitmir lab\` lists the projects your key reads.`); }
  }
  /* Ключ агента делают на проекте или репозитории, и читает он только это место:
   * без --project ему не к чему относиться. Личный ключ сохраняет `gitmir lab <key>`. */
  if (agentKey !== null && project === null) {
    die('--key goes with --project: an agent key is made on a project or repository.\n'
      + '    Your personal key is saved with `gitmir lab <key>`.');
  }

  if (sub === 'forget') {
    say(L.forget() ? 'Saved keys removed, the personal key and the agent key. Everything that does not need a model keeps working.'
                   : 'There was no saved key.');
    return;
  }

  /* Ключ приходит либо аргументом, либо уже сохранён. Печатать его обратно на
   * экран нельзя: терминалы попадают в скриншоты и в записи демонстраций. */
  if (sub && sub !== 'add' && sub !== 'add-here' && sub !== 'status') {
    try { const f = L.remember(sub); say(`Personal key saved in ${f}`); }
    catch (e) { die(String(e.message || e)); }
  }
  // Ключ агента ложится до регистрации: и проверка связи, и заголовок идут уже с ним.
  if (agentKey !== null) {
    try { const f = L.remember(agentKey, { agent: true }); say(`Agent key saved in ${f}`); }
    catch (e) { die(String(e.message || e)); }
  }

  if (sub === 'status') keysStatus(L);

  /* Проверка связи и регистрация у ассистента идут с ключом агента, а пока его
   * нет — с личным, как раньше. */
  const key = L.agentKey();
  if (!key) {
    console.log('');
    say(`${c('0;36', 'Not connected.')} The model of a product is built and kept in Intelligence.`);
    console.log('');
    say(`  1. Sign in at ${c('0;36', L.lab().signIn)}  (or sign up: ${L.lab().signUp})`);
    say(`  2. Open ${c('0;36', L.lab().keys)} and copy your key`);
    say(`  3. Run: ${c('0;36', 'gitmir lab ctx_your_key_here')}`);
    console.log('');
    say('Everything that does not need a model works without any of this:');
    say('  the task queue, findings, and the audits that walk a running app.');
    console.log('');
    return;
  }

  /* Проверяем связь, а не только наличие ключа. «Ключ задан» и «Intelligence
   * отвечает» — разные новости, и человек, только что вставивший ключ, хочет
   * знать вторую. */
  let products = [];
  try {
    const r = await L.view('projects', {});
    if (r.error) die(`Intelligence answered: ${r.error}`);
    products = (r.projects || []).map((x) => x.id).filter(Boolean);
  } catch (e) {
    die(`Could not reach Intelligence: ${String(e?.message || e)}`);
  }
  say(`${c('0;32', 'Connected.')} It can read: ${products.length ? products.join(', ') : '(nothing yet)'}`);

  if (sub !== 'add' && sub !== 'add-here') {
    console.log('');
    say(`To let your assistant ask it directly: ${c('0;36', 'gitmir lab add')}`);
    console.log('');
    return;
  }

  /* Регистрация Intelligence у ассистента.
   *
   * По умолчанию — пользовательская область, и это не лень: в проектной ключ
   * уехал бы в `.mcp.json` внутри репозитория, то есть в коммит. Одна
   * регистрация обслуживает все проекты: у инструментов Intelligence есть
   * аргумент проекта, и спрашивают они про тот, что назовут.
   *
   * С `--project` — локальная область: запись принадлежит этой папке, лежит в
   * конфиге Claude Code вне репозитория и здесь важнее общей записи с тем же
   * именем. Область пишется явно: на умолчание CLI полагаться нельзя — сменись
   * оно, привязка к папке тихо стала бы регистрацией везде.
   *
   * `--here` оставлен для тех, кому нужна привязка к папке, и туда пишется не
   * ключ, а ссылка на переменную окружения — секрет в репозиторий не попадает
   * ни в каком случае. */
  const here = sub === 'add-here';
  const scope = here ? 'project' : address ? 'local' : 'user';
  const url = address || L.lab().mcp;
  /* В .mcp.json с --project — ссылка на ключ агента: файл коммитят, и у каждого,
   * кто его откроет, свой ключ, сделанный на этом проекте. Без --project — как раньше. */
  const envName = here && address ? 'GITMIR_LAB_AGENT_KEY' : 'GITMIR_LAB_KEY';
  const header = here ? 'Authorization: Bearer ${' + envName + '}' : `Authorization: Bearer ${key}`;
  // На экран — только хвост ключа: ручную строку печатают, а терминалы попадают в скриншоты.
  const shown = here ? header : `Authorization: Bearer <your key, ending ${key.slice(-4)}>`;
  const again = `gitmir lab ${sub}${address ? ' --project ' + project : ''}`;
  const args = ['mcp', 'add', '-s', scope, 'gitmir-lab', '--transport', 'http',
                url, '--header', header];

  /* Адрес задаёт только проект по умолчанию; что можно читать, решает ключ.
   * Сказать это сразу — иначе адрес с проектом выглядит как пропуск в него. */
  const startsIn = () => {
    if (!address) return;
    say(`The connection starts in ${c('0;36', project)}: a question that names no project is about it.`);
    say('Naming another project still reaches only what this key reads.');
  };

  // С --project и без ключа агента регистрируется личный ключ — сказать, чем его заменить.
  if (address && !here && L.keySource()?.key === 'personal') {
    say(`This registers your personal key. An agent key is made on ${project} and reads only that place:`);
    say(`  ${c('0;36', `gitmir lab add --project ${project} --key <agent key>`)}`);
    console.log('');
  }

  try {
    console.log(runClaude(args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  } catch (e) {
    const said = `${e.stdout || ''}${e.stderr || ''}`.trim();
    if (e.code === 'ENOENT') {
      console.log('');
      say("The 'claude' CLI is not on your PATH. Register it by hand — this is the whole thing:");
      console.log('');
      /* Одной строкой и с адресом в кавычках: zsh читает `?` без кавычек как
       * шаблон имён файлов и отвечает «no matches found», не запустив команду.
       * Ссылка на переменную — в одинарных: в двойных оболочка подставит сам
       * ключ, и он уедет в `.mcp.json`, который коммитят. */
      const quoted = here ? `'${shown}'` : `"${shown}"`;
      console.log(`    claude mcp add -s ${scope} gitmir-lab --transport http "${url}" --header ${quoted}`);
      console.log('');
      if (!here) {
        say('Put the whole key in place of <…>. It is not printed here: terminals end up in screenshots.');
        console.log('');
      }
      if (address) {
        say(here ? `It goes into .mcp.json in ${process.cwd()}.` : `It is for this folder only: ${process.cwd()}`);
        startsIn();
        console.log('');
      }
      return;
    }
    if (/already exists/i.test(said)) {
      say(`${c('0;36', 'Already registered')} — gitmir-lab is in your ${scope} config${scope === 'local' ? ' for this folder' : ''}.`);
      /* С областью: без неё CLI сам выбирает, откуда удалять, а при --project
       * рядом часто лежит общая запись с тем же именем — удалить надо эту. */
      say(`To replace it:  ${c('0;36', `claude mcp remove gitmir-lab -s ${scope}`)}, then run ${c('0;36', again)} again.`);
      console.log('');
      return;
    }
    die(`claude could not register it:\n    ${said.split('\n')[0] || String(e.message || e)}`);
  }
  console.log('');
  if (here) {
    say(`Written into .mcp.json in ${process.cwd()}`);
    say(`${c('0;32', 'The key is not in that file')} — it reads ${envName} from the environment,`);
    say('so the file is safe to commit.');
    console.log('');
    /* И сразу же — единственная ловушка этого пути.
     *
     * Незаданная переменная не ломает загрузку конфигурации: подставляется
     * буквальная строка `${GITMIR_LAB_KEY}` (или `${GITMIR_LAB_AGENT_KEY}`), и она
     * уезжает в заголовке как ключ. Intelligence отвечает «неверный ключ», и
     * человек идёт проверять ключ — тот самый, который у него верный. Сказать об
     * этом надо здесь, а не оставить выяснять по симптому. */
    if ((process.env[envName] || '').trim()) {
      say(`${c('0;32', envName + ' is set in this shell')} — but your editor is a different one.`);
    } else {
      say(`${c('0;33', envName + ' is not set here.')} Until it is, the request goes out with the`);
      say('placeholder instead of a key, and Intelligence answers "bad key" about a key you have.');
    }
    say('Put this where your editor will see it (your shell profile, or the editor\'s own env):');
    console.log('');
    // Только хвост ключа: целиком он на экран не попадает.
    const forVar = envName === 'GITMIR_LAB_KEY' ? (L.key() || key) : key;
    console.log(`    export ${envName}=<your key, ending ${forVar.slice(-4)}>`);
    console.log('');
    say(`Nothing to set up if you drop the ${c('0;36', '--here')}: ${c('0;36', address ? 'gitmir lab add --project ' + project : 'gitmir lab add')} carries the key itself,`);
    say('in your own config, outside every repository.');
    if (address) { console.log(''); startsIn(); }
  } else if (address) {
    say(`Added for this folder only: ${process.cwd()}`);
    say('Claude Code keeps it in its own config, outside this repository, so no file here holds the key.');
    say('In this folder it wins over a gitmir-lab added for every project; everywhere else that one still answers.');
    console.log('');
    startsIn();
  } else {
    say('Added for every project. Ask it about one by name — it knows:');
    say(`  ${products.join(', ') || '(nothing yet)'}`);
  }
  console.log('');
  say(`Your assistant now has both: ${c('0;36', 'gitmir')} for the queue and the audits,`);
  say(`and ${c('0;36', 'gitmir-lab')} for what the product does.`);
  console.log('');
}

async function doctor() {
  const has = (cmd) => {
    try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; }
    catch { return false; }
  };
  let deps = '?';
  try { deps = String(Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8')).dependencies || {}).length); } catch {}
  let ver = '(not a git checkout)';
  try { ver = git(['log', '--oneline', '-1']).trim(); } catch {}

  const row = (k, v) => console.log('  ' + k.padEnd(16) + v);
  console.log(`\n  ${c('1;36', 'GitMir Local')}\n`);
  row('install', DIR);
  row('state', STATE);
  row('node', 'v' + process.versions.node + (nodeOk() ? '' : c('1;31', '  TOO OLD — needs 22.18+')));
  // Two agents, not one. This file already knows how to find Codex — where it is
  // installed it is usually inside ChatGPT.app and not on the PATH — so a machine
  // with Codex and no Claude was being told it was missing what it needs.
  row('claude CLI', has('claude') ? 'on PATH' : c('1;33', 'not found — needed only to run Claude Code from here'));
  const codex = codexBin();
  row('codex CLI', codex ? (codex === 'codex' ? 'on PATH' : codex) : c('1;33', 'not found — needed only to run Codex from here'));
  // Intelligence is half of what this tool does, and the first thing setup asks
  // for. Reading the environment is the whole test, deliberately: probing the
  // network here would make `gitmir status` sit on a timeout when offline.
  /* Признак подключения — один на весь клиент, и берётся он там же, где его
   * берут пульт и MCP-сервер. Своя копия этой проверки здесь смотрела только на
   * переменную окружения и потому говорила «не подключено» человеку, который
   * подключился командой минуту назад. */
  {
    const L = await import(path.join(DIR, 'lib', 'lab.js'));
    // keySource() — ключ, с которым ходят ассистенты: ключ агента или личный.
    const src = L.keySource();
    const which = src && src.key === 'agent' ? 'agent key' : 'key';
    row('Intelligence', !src ? c('1;33', 'not connected — run `gitmir lab` to connect')
      : src.source === 'environment' ? `connected (${which} from ${src.name})`
      : `connected (${which} saved in ${STATE})`);
  }
  row(`port ${PORT}`, (await listening()) ? 'serving' : 'not running');
  row('version', ver);
  row('runtime deps', deps);
  if (IN_NODE_MODULES) {
    console.log('');
    say(c('1;31', '✕') + ' Installed under node_modules — Node will not run TypeScript from there.');
    say('  Use the installer instead:  curl -fsSL https://ide.gitmir.com/install.sh | sh');
  }
  console.log('');
}

const HELP = `
  ${c('1;36', 'gitmir')} — the local dashboard for running Claude Code across projects

    gitmir              start it and open the browser
    gitmir stop         stop the server
    gitmir restart      stop, then start
    gitmir status       node, agents, Intelligence, port, version
    gitmir update       git pull, and restart if it was running
    gitmir mcp          the MCP config for your editor
    gitmir mcp add      register it for every project (Claude Code CLI)
    gitmir mcp add-here pin it to this folder, in .mcp.json
    gitmir check [dir]  set a project up, and print what is still missing (writes)

    gitmir lab          is Intelligence connected, and what can it read
    gitmir lab status   the keys on this machine, by their last four, and what uses each
    gitmir lab <key>    save your personal key from lab.gitmir.com/account/access
    gitmir lab add      let your assistant ask Intelligence directly
    gitmir lab add --project <id> [--key <agent key>]
                        start from that project, in this folder only;
                        --key saves the agent key made on it first
    gitmir lab add-here pin that to this folder (.mcp.json, key kept out of it)
    gitmir lab forget   remove both saved keys
    gitmir log [n]      the last n lines the server printed
    gitmir path         where the checkout lives

  Port ${PORT}, or set GITMIR_PORT.
`;

const [cmd = 'start', arg, flag] = process.argv.slice(2);
switch (cmd) {
  case 'start': await start(); break;
  case 'stop': await stop(); break;
  case 'restart': await stop({ quiet: true }); await wait(800); await start(); break;
  case 'status': case 'doctor': await doctor(); break;
  case 'update': await update(); break;
  case 'mcp': mcp(arg, flag); break;
  case 'check': check(arg); break;
  // Весь хвост, а не два слова: у `--project` есть значение, и оно третье.
  case 'lab': await labCmd(process.argv.slice(3)); break;
  case 'path': console.log(DIR); break;
  case 'log':
    try { console.log(fs.readFileSync(LOG, 'utf8').split('\n').slice(-(Number(arg) || 40)).join('\n')); }
    catch { say('Nothing logged yet.'); }
    break;
  case 'help': case '-h': case '--help': console.log(HELP); break;
  default: die(`No such command: ${cmd}   (try: gitmir help)`);
}
