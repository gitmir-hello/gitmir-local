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
 * and never will be — it lives in the laboratory — so asking for it printed
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
  // The laboratory is half of what this tool does, and the first thing setup asks
  // for. Reading the environment is the whole test, deliberately: probing the
  // network here would make `gitmir status` sit on a timeout when offline.
  row('laboratory', (process.env.GITMIR_LAB_KEY || '').trim()
    ? 'GITMIR_LAB_KEY is set'
    : c('1;33', 'no GITMIR_LAB_KEY — the model lives at lab.gitmir.com/account/access'));
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
    gitmir status       node, agents, laboratory, port, version
    gitmir update       git pull, and restart if it was running
    gitmir mcp          the MCP config for your editor
    gitmir mcp add      register it for every project (Claude Code CLI)
    gitmir mcp add-here pin it to this folder, in .mcp.json
    gitmir check [dir]  set a project up, and print what is still missing (writes)
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
  case 'path': console.log(DIR); break;
  case 'log':
    try { console.log(fs.readFileSync(LOG, 'utf8').split('\n').slice(-(Number(arg) || 40)).join('\n')); }
    catch { say('Nothing logged yet.'); }
    break;
  case 'help': case '-h': case '--help': console.log(HELP); break;
  default: die(`No such command: ${cmd}   (try: gitmir help)`);
}
