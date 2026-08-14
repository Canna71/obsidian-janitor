
import { JanitorView, JanitorViewProps, SelectableItem } from './JanitorView';
import { App, Modal, TFile, TFolder } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ScanResults } from '../FileScanner';
import JanitorPlugin from '../main';
import { OperationType } from '../JanitorSettings';


function changeSelection(list: SelectableItem[], names:string[], value:boolean) {
	return list.map((o, i) => names.contains( o.name) ? ({ ...o, selected: value }) : o)
}
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
			onSelectionChange: (i: number, section: string) => {
				this.handleSelectionChange(i, section);
			},
			onPerform: (operation:OperationType) => {
				this.perform(operation);
			},
			// defaultOperation: this.plugin.settings.defaultOperation,
			onOpen: (i: number, section: string) => {
				void this.handleOpen(i, section);
			},
			app: this.app,
		};
	}
	perform(operation:OperationType) {
		void this.plugin.perform(operation, this.extractFiles());
		this.close();
	}

	async handleOpen(ic: number, section: string) {
		const files = ((this.state as any)[section]) as SelectableItem[];
		const item = files[ic];
		//@ts-ignore
		await this.app.openWithDefaultApp(item.name);
	}

	handleSelectionChange(ic: number, section: string) {
		const files = ((this.state as any)[section]) as SelectableItem[];
		if (ic >= 0) {
			// single item toggle
			const item = files[ic];
			const newValue = !item.selected;
			this.applySelectionChangeToAllSections([item.name], newValue);    
		} else {
			const allSelected = files.every(file => file.selected);
			const names = files.map(file=>file.name);
			this.applySelectionChangeToAllSections(names,!allSelected);
		}

		this.render();
	}

	applySelectionChangeToAllSections(names:string[], value:boolean){
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
