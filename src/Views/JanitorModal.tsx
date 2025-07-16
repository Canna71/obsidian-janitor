
import { JanitorView, JanitorViewProps, SelectableItem } from './JanitorView';
import { App, Modal,  TFile } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ScanResults } from '../FileScanner';
import JanitorPlugin from '../main';
import { OperationType } from '../JanitorSettings';
import path from 'path';


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
			big: [],
			expired: [],
			emptyDirectories: [],
			onSelectionChange: (i: number, section: string) => {
				this.handleSelectionChange(i, section);
			},
			onPerform: (operation:OperationType) => {
				this.perform(operation);
			},
			// defaultOperation: this.plugin.settings.defaultOperation,
			onSettingChange: (setting: string, value: any) => {
				this.onSettingChange(setting, value);
			},
			onOpen:  (i: number, section: string) => {
				this.handleOpen(i, section);
			}
		};
	}
	perform(operation:OperationType) {
		const files = this.extractFiles();
		const folders = this.extractDirectories();
		this.plugin.perform(operation, files);
		if (folders.length > 0) {
			this.plugin.performOnDirectories(operation, folders);
		}
		this.close();
	}

	/**
	 * @deprecated The method should not be used
	 */
	onSettingChange(setting: string, value: any) {
		(this.plugin.settings as any)[setting] = value;
		this.plugin.saveSettings();
		this.state = {
			...this.state
		}
		this.render();
	}

	async handleOpen(ic: number, section: string) {
		const files = ((this.state as any)[section]) as SelectableItem[];
		const item = files[ic];
		//@ts-ignore
		const basePath = this.app.vault.adapter.getBasePath();
		const fullPath = path.join(basePath, item.name);
		//@ts-ignore
		const res = await this.app.openWithDefaultApp(item.name);

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
			big:  this.state.big && changeSelection(this.state.big, names, value),
			expired: this.state.expired && changeSelection(this.state.expired, names, value),
			emptyDirectories: this.state.emptyDirectories && changeSelection(this.state.emptyDirectories, names, value),
		}
	}

	public updateState(results: ScanResults) {
		this.state = {
			...this.state,
			scanning: results.scanning,
			orphans: this.fileToSelectableItem(results.orphans),
			empty: this.fileToSelectableItem(results.empty),
			expired: this.fileToSelectableItem(results.expired),
			big: this.fileToSelectableItem(results.big),
			emptyDirectories: this.folderToSelectableItem(results.emptyDirectories)
		};

		this.render();
	}

	private fileToSelectableItem(files: TFile[] | false): SelectableItem[]|false {
		return files && files.map(tfile => ({
			name: tfile.path,
			selected: false
		}));
	}

	private folderToSelectableItem(folders: string[] | false): SelectableItem[]|false {
		return folders && folders.map(folderPath => ({
			name: folderPath,
			selected: false
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

		this.root = createRoot(contentEl);
		this.render();

	}

	onClose() {

		this.root.unmount();
	}



	extractFiles() {
		return [this.state.orphans, this.state.empty, this.state.big, this.state.expired]
			.flatMap(list =>
				list ? list.filter(f => f.selected).map(f => f.name) : []
			)

	}

	extractDirectories() {
		return this.state.emptyDirectories 
			? this.state.emptyDirectories.filter(f => f.selected).map(f => f.name)
			: []
	}
}
