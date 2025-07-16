import { DatePickerModal } from "./Views/DatePickerModal";
import { OperationType } from "./JanitorSettings";
import { JanitorModal } from "./Views/JanitorModal";

import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	stringifyYaml,
	TFile,
	View,
} from "obsidian";
import { FileScanner } from "src/FileScanner";
import { DEFAULT_SETTINGS, JanitorSettings } from "src/JanitorSettings";
import JanitorSettingsTab from "src/PluginSettingsTab";
import { FileProcessor } from "src/FileProcessor";
import moment from "moment";

export default class JanitorPlugin extends Plugin {
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
			name: "Scan Files",
			callback: () => {
				this.scanFiles();
			},
		});
		this.addCommand({
			id: "scan-files-noprompt",
			name: "Scan Files (without prompt)",
			callback: () => {
				this.scanFiles(false, true);
			},
		});
		this.addCommand({
			id: "scan-files-with-prompt",
			name: "Scan Files (with prompt)",
			callback: () => {
				this.scanFiles(true, false);
			},
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

		// this.app.workspace.onLayoutReady(()=>{
		// 	if (this.settings.runAtStartup) {
		// 		this.scanFiles();
		// 	}
		// })

		this.app.metadataCache.on("resolved", () => {
			if (this.settings.runAtStartup && !this.initialScanDone) {
				this.initialScanDone = true;
				this.scanFiles();
			}
		});
	}

	frontMatterRegEx = /^---$(.*)^---/ms;

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
		const metaData = this.app.metadataCache.getFileCache(
			view.file
		)?.frontmatter;
		let start = metaData?.position.start.offset || 0;
		let end = metaData?.position.end.offset || 0;
		// no metadata could also mean empty metadata secion
		const newMetadata = {
			...metaData,
			...{ [this.settings.expiredAttribute]: dateToSet },
			position: undefined,
		};
		const newYaml = stringifyYaml(newMetadata);
		const content = await this.app.vault.cachedRead(view.file);
		const m = this.frontMatterRegEx.exec(content);
		if (!metaData && m) {
			//empty frontmatter
			start = m.index;
			end = m.index + m[0].length;
		}
		const frontMatter = "---\n" + newYaml + "---\n";
		// if(view.getMode()) reading = "preview" edit = "source"
		if (view.getMode() === "source") {
			view.editor.replaceRange(
				frontMatter,
				view.editor.offsetToPos(start),
				view.editor.offsetToPos(end)
			);
		} else {
			const newContent =
				content.substring(0, start) +
				frontMatter +
				content.substring(end);
			this.app.vault.modify(view.file, newContent);
		}
	}

	private updateStatusBar(message: string) {
		this.statusBarItemEl.setText(message);
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
			(results.expired && results.expired.length) ||
			(results.big && results.big.length) ||
			(results.emptyDirectories && results.emptyDirectories.length);
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
				results.expired,
				results.big,
			].flatMap((list) => (list ? list.map((file) => file.path) : []));
			files = [...new Set(files)];
			
			// Handle empty directories separately
			const directories = results.emptyDirectories || [];
			
			await this.perform(this.settings.defaultOperation, files);
			if (directories.length > 0) {
				await this.performOnDirectories(this.settings.defaultOperation, directories);
			}
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

	async performOnDirectories(operation: OperationType, directories: string[]) {
		const fileProcessor = new FileProcessor(this.app);
		const processingResult = await fileProcessor.processDirectories(directories, operation);
		new Notice(
			`${processingResult.deletedFiles} folders deleted.` +
				(processingResult.notDeletedFiles
					? `${processingResult.notDeletedFiles} folders not deleted`
					: "")
		);
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
