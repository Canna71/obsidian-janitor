import { App, FileSystemAdapter, Platform } from "obsidian";

/**
 * Startup-hang diagnostics, off unless "Debug logging" is on in the settings.
 * Each line goes to the console and, on desktop, is appended synchronously to
 * `<plugin dir>/debug.log`, so the last line written survives a renderer that
 * never yields again.
 */
let enabled = false;
let logPath: string | null = null;
let appendFileSync: ((path: string, data: string) => void) | null = null;
let stopStallWatch: (() => void) | null = null;
const t0 = performance.now();

export function setDebugLogging(on: boolean, app: App, pluginDir: string) {
	if (on === enabled) return;
	enabled = on;
	if (!on) {
		stopStallWatch?.();
		stopStallWatch = null;
		logPath = null;
		return;
	}
	stopStallWatch = startStallWatch();
	if (!Platform.isDesktopApp || !(app.vault.adapter instanceof FileSystemAdapter)) return;
	try {
		const fs = window.require("fs") as typeof import("fs");
		appendFileSync = (p, d) => fs.appendFileSync(p, d);
		logPath = `${app.vault.adapter.getBasePath()}/${pluginDir}/debug.log`;
		appendFileSync(logPath, `\n===== ${new Date().toISOString()} session start =====\n`);
	} catch (e) {
		console.error("[janitor] cannot open debug.log", e);
		logPath = null;
	}
}

export function dlog(...parts: unknown[]) {
	if (!enabled) return;
	const line = `[janitor +${(performance.now() - t0).toFixed(0)}ms] ` +
		parts.map(p => typeof p === "string" ? p : JSON.stringify(p)).join(" ");
	console.debug(line);
	if (logPath && appendFileSync) {
		try {
			appendFileSync(logPath, line + "\n");
		} catch {
			// logging must never break the plugin
		}
	}
}

/** Logs entry and exit of a synchronous step with its duration. */
export function timed<T>(label: string, fn: () => T): T {
	dlog(`> ${label}`);
	const start = performance.now();
	const result = fn();
	dlog(`< ${label} ${(performance.now() - start).toFixed(0)}ms`);
	return result;
}

/** Logs entry and exit of an asynchronous step with its duration. */
export async function timedAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
	dlog(`> ${label}`);
	const start = performance.now();
	const result = await fn();
	dlog(`< ${label} ${(performance.now() - start).toFixed(0)}ms`);
	return result;
}

/**
 * Logs whenever the main thread was blocked for longer than `thresholdMs`.
 * A timer that fires late means synchronous work held the event loop.
 */
function startStallWatch(thresholdMs = 500, intervalMs = 100): () => void {
	let last = performance.now();
	const id = window.setInterval(() => {
		const now = performance.now();
		const lag = now - last - intervalMs;
		if (lag > thresholdMs) dlog(`! main thread blocked ~${lag.toFixed(0)}ms`);
		last = now;
	}, intervalMs);
	return () => window.clearInterval(id);
}
