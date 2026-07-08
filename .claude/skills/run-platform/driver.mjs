// REPL driver for platform/ (Dokploy fork control-plane UI).
// Drives a headless Chromium against an already-running dev server
// (default http://localhost:3000). Run under tmux and send-keys one
// command at a time so the (slow, stateful) session survives between
// interactions.

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SHOT_DIR = process.env.SCREENSHOT_DIR || "/tmp/shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let page = null;
const consoleErrors = [];

const COMMANDS = {
	async launch() {
		if (browser) return console.log("already launched");
		browser = await chromium.launch({ args: ["--no-sandbox"] });
		page = await browser.newPage();
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});
		page.on("pageerror", (err) => consoleErrors.push(String(err)));
		console.log("launched.");
	},

	async nav(url) {
		if (!page) return console.log("ERROR: launch first");
		const target = /^https?:\/\//.test(url)
			? url
			: `${BASE_URL}${url ? `/${url.replace(/^\//, "")}` : ""}`;
		const res = await page.goto(target, {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
		});
		console.log("nav", target, "→", res ? res.status() : "(no response)");
	},

	async ss(name) {
		if (!page) return console.log("ERROR: launch first");
		const f = path.join(SHOT_DIR, `${name || `ss-${Date.now()}`}.png`);
		await page.screenshot({ path: f, fullPage: true });
		console.log("screenshot:", f);
	},

	async "screenshot-element"(args) {
		if (!page) return console.log("ERROR: launch first");
		const [sel, name] =
			args.split(/\s+(.+)/).filter(Boolean).length > 1
				? [args.split(/\s+/)[0], args.split(/\s+/).slice(1).join(" ")]
				: [args, undefined];
		const el = await page.$(sel);
		if (!el) return console.log("NOT_FOUND:", sel);
		const f = path.join(SHOT_DIR, `${name || `ss-el-${Date.now()}`}.png`);
		await el.screenshot({ path: f });
		console.log("screenshot-element:", sel, "→", f);
	},

	async click(sel) {
		if (!page) return console.log("ERROR: launch first");
		try {
			await page.click(sel, { timeout: 10_000 });
			console.log("click", sel, "→ OK");
		} catch (e) {
			console.log("click", sel, "→ ERROR:", e.message);
		}
	},

	async fill(args) {
		if (!page) return console.log("ERROR: launch first");
		const sp = args.indexOf(" ");
		const sel = sp === -1 ? args : args.slice(0, sp);
		const value = sp === -1 ? "" : args.slice(sp + 1);
		try {
			await page.fill(sel, value, { timeout: 10_000 });
			console.log("fill", sel, "→ OK");
		} catch (e) {
			console.log("fill", sel, "→ ERROR:", e.message);
		}
	},

	async type(text) {
		if (page) await page.keyboard.type(text, { delay: 20 });
	},
	async press(key) {
		if (page) await page.keyboard.press(key);
	},

	async "wait-for"(sel) {
		if (!page) return console.log("ERROR: launch first");
		try {
			if (sel.startsWith("text="))
				await page.getByText(sel.slice(5)).first().waitFor({ timeout: 15_000 });
			else await page.waitForSelector(sel, { timeout: 15_000 });
			console.log("found:", sel);
		} catch {
			console.log("TIMEOUT:", sel);
		}
	},

	async eval(expr) {
		if (!page) return console.log("ERROR: launch first");
		try {
			console.log(JSON.stringify(await page.evaluate(expr)));
		} catch (e) {
			console.log("ERROR:", e.message);
		}
	},

	async text(sel) {
		if (!page) return console.log("ERROR: launch first");
		console.log(
			await page.evaluate(
				(s) =>
					(s ? document.querySelector(s) : document.body)?.innerText ??
					"(null)",
				sel || null,
			),
		);
	},

	async url() {
		if (page) console.log(page.url());
	},

	async console(args) {
		if (args === "--errors" || args === "-e") {
			if (consoleErrors.length === 0) console.log("no console errors");
			else consoleErrors.forEach((e, i) => console.log(`[${i}]`, e));
		} else {
			console.log(
				consoleErrors.length,
				'error(s) captured — use "console --errors" to list',
			);
		}
	},

	async quit() {
		if (browser) await browser.close().catch(() => {});
		browser = null;
		page = null;
	},
	help() {
		console.log("commands:", Object.keys(COMMANDS).join(", "));
	},
};

const stdin = fs.createReadStream(null, { fd: fs.openSync("/dev/stdin", "r") });
const rl = readline.createInterface({
	input: stdin,
	output: process.stdout,
	prompt: "driver> ",
});

// Lines can arrive faster than an async command resolves (e.g. piped via a
// heredoc) — readline fires 'line' events without waiting for the previous
// handler's promise, so a queue is needed to keep commands from racing.
let queue = Promise.resolve();
rl.on("line", (line) => {
	queue = queue.then(async () => {
		const trimmed = line.trim();
		const sp = trimmed.indexOf(" ");
		const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
		const rest = sp === -1 ? "" : trimmed.slice(sp + 1);
		if (!cmd) return rl.prompt();
		const fn = COMMANDS[cmd];
		if (!fn) {
			console.log("unknown:", cmd, "— try: help");
			return rl.prompt();
		}
		try {
			await fn(rest);
		} catch (e) {
			console.log("ERROR:", e.message);
		}
		if (cmd === "quit") {
			rl.close();
			process.exit(0);
		}
		rl.prompt();
	});
});
// Piped input (heredoc) hits EOF as soon as all lines are read, which can
// fire 'close' well before the queued async commands above have finished —
// wait for the queue to drain first so a piped script runs to completion.
rl.on("close", async () => {
	await queue;
	await COMMANDS.quit();
	process.exit(0);
});

console.log(
	'platform driver — "help" for commands, "launch" to start, then "nav /register"',
);
rl.prompt();
