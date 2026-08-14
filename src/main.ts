import { DatePickerModal } from "./Views/DatePickerModal";
import { OperationType } from "./JanitorSettings";
import { JanitorModal } from "./Views/JanitorModal";

import {
	MarkdownView,
	moment,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
import { FileScanner } from "src/FileScanner";
import { DEFAULT_SETTINGS, JanitorSettings } from "src/JanitorSettings";
import JanitorSettingsTab from "src/PluginSettingsTab";
import { FileProcessor } from "src/FileProcessor";

export default class JanitorPlugin extends Plugin {
	/** How long the metadata cache must stay quiet before the startup scan runs. */
	private static readonly CACHE_SETTLE_MS = 2000;
	/** Upper bound on waiting for the cache, so the scan always eventually runs. */
	private static readonly CACHE_TIMEOUT_MS = 120000;

	settings: JanitorSettings;
	statusBarItemEl: HTMLElement;
	ribbonIconEl: HTMLElement;
	initialScanDone = false;

	async onload() {
		this.initialScanDone = false;
		await this.loadSettings();

		if (this.settings.addRibbonIcon) {
			this.addIcon();
		}

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar("");

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "scan-files",
			name: "Scan files",
			callback: () => {
				this.scanFiles();
			},
		});
		this.addCommand({
			id: "scan-files-noprompt",
			name: "Scan files (without prompt)",
			callback: () => {
				this.scanFiles(false, true);
			},
		});
		this.addCommand({
			id: "scan-files-with-prompt",
			name: "Scan files (with prompt)",
			callback: () => {
				this.scanFiles(true, false);
			},
		});
		this.addCommand({
			id: "scan-vault-orphans",
			name: "Scan vault (orphans)",
			callback: () => { this.scanFilesFor("orphans"); },
		});
		this.addCommand({
			id: "scan-vault-expired",
			name: "Scan vault (expired)",
			callback: () => { this.scanFilesFor("expired"); },
		});
		this.addCommand({
			id: "scan-vault-big",
			name: "Scan vault (big files)",
			callback: () => { this.scanFilesFor("big"); },
		});

		this.addCommand({
			id: "set-expiration",
			name: "Sets the expiration date of the current note",
			checkCallback: (checking: boolean) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						this.chooseDate(markdownView);
					}
					return true;
				}
				return false;
			},
		});

		this.createShortcutCommand(
			"set-expiration-1week",
			"Set Expiration (1 week)",
			1,
			"week"
		);
		this.createShortcutCommand(
			"set-expiration-1month",
			"Set Expiration (1 month)",
			1,
			"month"
		);
		this.createShortcutCommand(
			"set-expiration-1year",
			"Set Expiration (1 year)",
			1,
			"year"
		);

		this.addSettingTab(new JanitorSettingsTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.runAtStartup || this.initialScanDone) {
				return;
			}
			this.initialScanDone = true;
			void this.runStartupScan();
		});
	}

	private async runStartupScan() {
		await this.waitForSyncIfNeeded();
		await this.waitForMetadataCache();
		this.scanFiles();
	}

	/**
	 * `metadataCache.on("resolved")` fires every time the cache's work queue
	 * drains, which happens repeatedly while a large vault is indexed at
	 * startup. Scanning on the first one reads a half-built `resolvedLinks`,
	 * so attachments belonging to not-yet-parsed notes are reported as orphans.
	 *
	 * Wait until every markdown file has an entry in `resolvedLinks` and the
	 * cache has then stayed quiet for a moment before letting the scan run.
	 */
	private waitForMetadataCache(): Promise<void> {
		return new Promise((resolve) => {
			let settleTimer: number | undefined;
			let timeoutTimer: number | undefined;
			let settled = false;

			const finish = () => {
				if (settled) return;
				settled = true;
				window.clearTimeout(settleTimer);
				window.clearTimeout(timeoutTimer);
				this.app.metadataCache.offref(ref);
				resolve();
			};

			// Obsidian keys `resolvedLinks` by every markdown file it has
			// parsed, so a short count is proof the index is still filling in.
			const indexIsComplete = () =>
				Object.keys(this.app.metadataCache.resolvedLinks).length >=
				this.app.vault.getMarkdownFiles().length;

			const check = () => {
				window.clearTimeout(settleTimer);
				if (!indexIsComplete()) return;
				settleTimer = window.setTimeout(
					finish,
					JanitorPlugin.CACHE_SETTLE_MS
				);
			};

			const ref = this.app.metadataCache.on("resolved", check);
			this.registerEvent(ref);

			// Sync or another plugin can keep the cache busy indefinitely.
			// Scan anyway rather than never running the startup scan at all.
			timeoutTimer = window.setTimeout(
				finish,
				JanitorPlugin.CACHE_TIMEOUT_MS
			);
			check();
		});
	}

	private createShortcutCommand(id: string, name: string, n: number, w: any) {
		this.addCommand({
			id: id,
			name: name,
			checkCallback: (checking: boolean) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						this.updateNoteWithDate(
							markdownView,
							moment()
								.add(n, w)
								.format(this.settings.expiredDateFormat)
						);
					}
					return true;
				}
				return false;
			},
		});
	}

	async chooseDate(view: MarkdownView) {
		new DatePickerModal(this.app, this, view).open();
	}

	async updateNoteWithDate(view: MarkdownView, dateToSet: string) {
		await this.app.fileManager.processFrontMatter(view.file, (fm) => {
			fm[this.settings.expiredAttribute] = dateToSet;
		});
	}

	private updateStatusBar(message: string) {
		this.statusBarItemEl.setText(message);
	}

	private async scanFilesFor(category: "orphans" | "expired" | "big") {
		new Notice("Janitor is scanning vault");
		this.updateStatusBar("Janitor Scanning...");
		const scanSettings = {
			...this.settings,
			processOrphans: category === "orphans",
			processEmpty: false,
			processExpired: category === "expired",
			processBig: category === "big",
		};
		const results = await new FileScanner(this.app, scanSettings).scan();
		this.updateStatusBar("");
		const found = (results.orphans && results.orphans.length) ||
			(results.expired && results.expired.length) ||
			(results.big && results.big.length);
		if (!found) {
			new Notice("Janitor scanned and found nothing to cleanup");
			return;
		}
		const modal = new JanitorModal(this.app, this);
		modal.open();
		modal.updateState(results);
	}

	private async scanFiles(forcePrompt = false, noPrompt = false) {
		new Notice("Janitor is scanning vault");
		this.updateStatusBar("Janitor Scanning...");
		let modal;
		const results = await new FileScanner(this.app, this.settings).scan();
		// artificially introduce waiting for testing purposes
		// await delay(1000);
		const foundSomething =
			(results.orphans && results.orphans.length) ||
			(results.empty && results.empty.length) ||
			(results.emptyFolders && results.emptyFolders.length) ||
			(results.expired && results.expired.length) ||
			(results.big && results.big.length);
		this.updateStatusBar("");
		if (!foundSomething) {
			new Notice(`Janitor scanned and found nothing to cleanup`);
			return;
		}
		// We determine if we have to prompt the user,
		// even if user disabled prompting, we could have to prompt
		// for big files to avoid deleting important stuff in an unattended way
		if (
			(this.settings.promptUser && !noPrompt) ||
			(results.big?.length && this.settings.promptForBigFiles) ||
			forcePrompt
		) {
			modal = new JanitorModal(this.app, this);
			modal.open();
		}
		if (modal) {
			// if we have to prompt the user let's him/her decide which files
			// and which action to perform
			modal.updateState(results);
		} else {
			// we should process all available files
			let files = [
				results.orphans,
				results.empty,
				results.emptyFolders,
				results.expired,
				results.big,
			].flatMap((list) => (list ? list.map((file) => file.path) : []));
			files = [...new Set(files)];
			this.perform(this.settings.defaultOperation, files);
		}
	}

	async perform(operation: OperationType, files: string[]) {
		const fileProcessor = new FileProcessor(this.app);
		const processingResult = await fileProcessor.process(files, operation);
		new Notice(
			`${processingResult.deletedFiles} files deleted.` +
				(processingResult.notDeletedFiles
					? `${processingResult.notDeletedFiles} files not deleted`
					: "")
		);
	}

	private waitForSyncIfNeeded(): Promise<void> {
		const syncPlugin = (this.app as any).internalPlugins?.plugins?.['sync']?.instance;
		if (!syncPlugin || !syncPlugin.syncing) {
			return Promise.resolve();
		}
		return new Promise(resolve => {
			const handler = syncPlugin.on('status-change', () => {
				if (!syncPlugin.syncing) {
					syncPlugin.offref(handler);
					resolve();
				}
			});
		});
	}

	onunload() {}

	public addIcon() {
		this.removeIcon();
		this.ribbonIconEl = this.addRibbonIcon(
			"trash",
			"Janitor: scan vault",
			(evt: MouseEvent) => {
				this.scanFiles();
			}
		);
		this.ribbonIconEl.addClass("janitor-ribbon-class");
	}

	public removeIcon() {
		if (this.ribbonIconEl) {
			this.ribbonIconEl.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
