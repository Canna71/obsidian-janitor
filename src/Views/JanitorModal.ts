import { App, ButtonComponent, Modal, Notice, TFile, TFolder } from "obsidian";
import { ScanResults } from '../FileScanner';
import JanitorPlugin from '../main';
import { OperationType } from '../JanitorSettings';
import { FileTree, ResultItem } from "./FileTree";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'svg'];

type SectionKey = "orphans" | "empty" | "emptyFolders" | "expired" | "big";

const SECTIONS: { key: SectionKey, title: string, showPreview: boolean }[] = [
	{ key: "orphans", title: "Orphans", showPreview: true },
	{ key: "empty", title: "Empty", showPreview: true },
	{ key: "emptyFolders", title: "Empty folders", showPreview: false },
	{ key: "expired", title: "Expired", showPreview: true },
	{ key: "big", title: "Big", showPreview: true },
];

export class JanitorModal extends Modal {
	plugin: JanitorPlugin;
	private items: Partial<Record<SectionKey, ResultItem[]>> = {};
	private selected = new Set<string>();
	private trees: { key: SectionKey, tree: FileTree }[] = [];
	private resultsEl: HTMLElement;
	private operationButtons: ButtonComponent[] = [];

	constructor(app: App, plugin: JanitorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		this.modalEl.addClass('janitor-main-modal');
		this.titleEl.setText("Janitor scan results");
		this.resultsEl = this.contentEl.createDiv("janitor-scan-results");
		this.resultsEl.createEl("h4", { text: "Scanning..." });

		const footer = this.contentEl.createDiv("modal-button-container");
		const operations: [OperationType, string, string][] = [
			[OperationType.Trash, "Trash (Obsidian)", "Put files in the Obsidian .trash"],
			[OperationType.TrashSystem, "Trash (system)", "Put files in the OS' trash"],
			[OperationType.Delete, "Delete", "Permanently delete files"],
		];
		for (const [operation, text, tooltip] of operations) {
			this.operationButtons.push(new ButtonComponent(footer)
				.setButtonText(text)
				.setTooltip(tooltip)
				.setDisabled(true)
				.onClick(() => this.perform(operation)));
		}
		new ButtonComponent(footer).setButtonText("Cancel").setCta().onClick(() => this.close());
	}

	onClose() {
		for (const { tree } of this.trees) tree.hidePreview();
		this.contentEl.empty();
	}

	public updateState(results: ScanResults) {
		this.items = {
			orphans: this.fileItems(results.orphans),
			empty: this.fileItems(results.empty),
			emptyFolders: results.emptyFolders ? results.emptyFolders.map((f: TFolder) => ({ path: f.path })) : [],
			expired: this.fileItems(results.expired),
			big: this.fileItems(results.big),
		};
		this.selected.clear();
		this.resultsEl.empty();
		this.trees = [];
		for (const { key, title, showPreview } of SECTIONS) {
			const items = this.items[key] ?? [];
			if (!items.length) continue;
			const tree = new FileTree(this.resultsEl, items, {
				app: this.app,
				title,
				showPreview,
				selected: this.selected,
				onSelect: (paths, value) => this.select(paths, value),
				onOpen: (path) => void this.openWithDefaultApp(path),
				onIgnore: (path, isFolder) => void this.ignore(path, isFolder),
			});
			this.trees.push({ key, tree });
		}
		this.refreshSelection();
	}

	private fileItems(files: TFile[] | false): ResultItem[] {
		return files ? files.map(tfile => ({
			path: tfile.path,
			size: tfile.stat.size,
			resourcePath: IMAGE_EXTENSIONS.includes(tfile.extension.toLowerCase())
				? this.app.vault.getResourcePath(tfile)
				: undefined,
		})) : [];
	}

	private select(paths: string[], value: boolean) {
		for (const path of paths) {
			if (value) this.selected.add(path); else this.selected.delete(path);
		}
		this.refreshSelection();
	}

	private refreshSelection() {
		for (const { tree } of this.trees) tree.refreshSelection();
		for (const button of this.operationButtons) button.setDisabled(this.selected.size === 0);
	}

	private perform(operation: OperationType) {
		void this.plugin.perform(operation, [...this.selected]);
		this.close();
	}

	private async openWithDefaultApp(path: string) {
		//@ts-ignore
		await this.app.openWithDefaultApp(path);
	}

	/**
	 * Adds an anchored pattern for `path` to the excluded files and drops the
	 * matching items from the results, as the next scan would.
	 */
	private async ignore(path: string, isFolder: boolean) {
		const filter = isFolder ? `^${escapeRegExp(path)}/` : `^${escapeRegExp(path)}$`;
		const settings = this.plugin.settings;
		settings.excludedFilesFilters = [...(settings.excludedFilesFilters || []), filter];
		await this.plugin.saveSettings();

		const matches = (p: string) => isFolder ? p === path || p.startsWith(`${path}/`) : p === path;
		for (const p of [...this.selected]) {
			if (matches(p)) this.selected.delete(p);
		}
		for (const { key, tree } of this.trees) {
			const items = (this.items[key] ?? []).filter(i => !matches(i.path));
			this.items[key] = items;
			tree.setItems(items);
		}
		new Notice(`Janitor will ignore ${path}${isFolder ? "/" : ""}`);
		this.refreshSelection();
	}
}
