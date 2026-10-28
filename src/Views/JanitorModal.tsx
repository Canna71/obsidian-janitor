
import { JanitorView, JanitorViewProps, SelectableItem } from './JanitorView';
import { App, Modal, Notice, TFile, TFolder } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ScanResults } from '../FileScanner';
import JanitorPlugin from '../main';
import { OperationType } from '../JanitorSettings';


function changeSelection(list: SelectableItem[], names: Set<string>, value: boolean) {
	return list.map(o => names.has(o.name) && o.selected !== value ? ({ ...o, selected: value }) : o)
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export class JanitorModal extends Modal {

	plugin: JanitorPlugin;
	root: Root;
	state: JanitorViewProps;

	constructor(app: App, plugin: JanitorPlugin) {
		super(app);
		this.plugin = plugin;
		this.state = {
			onClose: () => { this.close() },
			scanning: true,
			orphans: [],
			empty: [],
			emptyFolders: [],
			big: [],
			expired: [],
			onSelect: (paths: string[], value: boolean) => {
				this.applySelectionChangeToAllSections(paths, value);
				this.render();
			},
			onIgnore: (path: string, isFolder: boolean) => {
				void this.ignore(path, isFolder);
			},
			onPerform: (operation:OperationType) => {
				this.perform(operation);
			},
			// defaultOperation: this.plugin.settings.defaultOperation,
			onOpen: (path: string) => {
				void this.handleOpen(path);
			},
			app: this.app,
		};
	}
	perform(operation:OperationType) {
		void this.plugin.perform(operation, this.extractFiles());
		this.close();
	}

	async handleOpen(path: string) {
		//@ts-ignore
		await this.app.openWithDefaultApp(path);
	}

	/**
	 * Adds an anchored pattern for `path` to the excluded files and drops the
	 * matching items from the results, as the next scan would.
	 */
	async ignore(path: string, isFolder: boolean) {
		const filter = isFolder ? `^${escapeRegExp(path)}/` : `^${escapeRegExp(path)}$`;
		const settings = this.plugin.settings;
		settings.excludedFilesFilters = [...(settings.excludedFilesFilters || []), filter];
		await this.plugin.saveSettings();
		const keep = (list: SelectableItem[] | false) => list &&
			list.filter(o => isFolder ? !o.name.startsWith(`${path}/`) && o.name !== path : o.name !== path);
		this.state = {
			...this.state,
			orphans: keep(this.state.orphans),
			empty: keep(this.state.empty),
			emptyFolders: keep(this.state.emptyFolders),
			big: keep(this.state.big),
			expired: keep(this.state.expired),
		};
		new Notice(`Janitor will ignore ${path}${isFolder ? "/" : ""}`);
		this.render();
	}

	applySelectionChangeToAllSections(paths:string[], value:boolean){
		const names = new Set(paths);
		this.state = {
			...this.state,
			orphans: this.state.orphans && changeSelection(this.state.orphans, names, value),
			empty:  this.state.empty && changeSelection(this.state.empty , names, value),
			emptyFolders: this.state.emptyFolders && changeSelection(this.state.emptyFolders, names, value),
			big:  this.state.big && changeSelection(this.state.big, names, value),
			expired: this.state.expired && changeSelection(this.state.expired, names, value),
		}
	}

	public updateState(results: ScanResults) {
		this.state = {
			...this.state,
			scanning: results.scanning,
			orphans: this.fileToSelectableItem(results.orphans),
			empty: this.fileToSelectableItem(results.empty),
			emptyFolders: this.folderToSelectableItem(results.emptyFolders),
			expired: this.fileToSelectableItem(results.expired),
			big: this.fileToSelectableItem(results.big)
		};

		this.render();
	}

	private static readonly IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'svg'];

	private fileToSelectableItem(files: TFile[] | false): SelectableItem[]|false {
		return files && files.map(tfile => ({
			name: tfile.path,
			selected: false,
			size: tfile.stat.size,
			resourcePath: JanitorModal.IMAGE_EXTENSIONS.contains(tfile.extension.toLowerCase())
				? this.app.vault.getResourcePath(tfile)
				: undefined
		}));
	}

	private folderToSelectableItem(folders: TFolder[] | false): SelectableItem[] | false {
		return folders && folders.map(tfolder => ({
			name: tfolder.path,
			selected: false,
		}));
	}

	render() {
		this.root.render(
			<React.StrictMode>
				<JanitorView {...this.state} />
			</React.StrictMode>
		);
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass('janitor-main-modal');
		this.root = createRoot(contentEl);
		this.render();
	}

	onClose() {

		this.root.unmount();
	}



	extractFiles() {
		return [this.state.orphans, this.state.empty, this.state.emptyFolders, this.state.big, this.state.expired]
			.flatMap(list =>
				list ? list.filter(f => f.selected).map(f => f.name) : []
			)
	}
}
