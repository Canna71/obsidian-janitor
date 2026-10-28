import { App, ButtonComponent, Modal, Setting, TextComponent, TFolder } from "obsidian";
import { FilterSuggest } from "./FilterSuggest";

const HINT = "Choose a folder or type a regular expression, then press Enter.";

/** Edits a list of path filters (regular expressions), with folder suggestions. */
export class FiltersModal extends Modal {
	private list: string[];
	private listEl: HTMLElement;

	constructor(
		app: App,
		title: string,
		private description: string,
		filters: string[],
		private onFiltersChanged: (filters: string[]) => Promise<void>,
	) {
		super(app);
		this.titleEl.setText(title);
		this.list = [...filters];
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createDiv({ text: this.description });
		this.listEl = contentEl.createDiv("janitor-filter-list");
		this.drawList();

		const folders = this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && !f.isRoot())
			.map(f => `${f.path}/`)
			.sort();

		const add = new Setting(contentEl)
			.setName("Add filter")
			.setDesc(HINT)
			.setClass("janitor-filter-add");
		const input = new TextComponent(add.controlEl).setPlaceholder("Folder or regular expression");
		const addButton = new ButtonComponent(add.controlEl)
			.setButtonText("Add")
			.setDisabled(true)
			.onClick(() => this.add(input.getValue(), input));
		input.onChange(value => {
			const valid = isValidRE(value);
			addButton.setDisabled(!valid);
			add.setDesc(valid || !value ? HINT : "Not a valid regular expression.");
		});
		new FilterSuggest(this.app, input.inputEl, folders, isValidRE, value => this.add(value, input));

		const buttons = contentEl.createDiv("modal-button-container");
		new ButtonComponent(buttons).setButtonText("Done").setCta().onClick(() => {
			this.close();
			void this.onFiltersChanged(this.list);
		});
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}

	private add(filter: string, input: TextComponent) {
		if (!isValidRE(filter)) return;
		if (!this.list.includes(filter)) this.list.push(filter);
		input.setValue("");
		input.onChanged();
		this.drawList();
	}

	private drawList() {
		this.listEl.empty();
		this.list.forEach((filter, i) => {
			new Setting(this.listEl)
				.setClass("janitor-filter-row")
				.setName(createFragment(f => { f.createEl("code", { text: filter }); }))
				.addExtraButton(button => button
					.setIcon("x")
					.setTooltip("Remove filter")
					.onClick(() => {
						this.list.splice(i, 1);
						this.drawList();
					}));
		});
	}
}

function isValidRE(value: string) {
	if (!value) return false;
	try {
		new RegExp(value);
		return true;
	} catch {
		return false;
	}
}
