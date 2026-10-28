import * as React from "react";
import { App, Modal, TFolder } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import CloseIcon from "../svg/close.svg";
import { useCallback, useEffect, useRef, useState } from "react";
import { FilterSuggest } from "./FilterSuggest";

/** Edits a list of path filters (regular expressions), with folder suggestions. */
export class FiltersModal extends Modal {
	root: Root;

	constructor(
		app: App,
		title: string,
		private description: string,
		private filters: string[],
		private onFiltersChanged: (filters: string[]) => Promise<void>,
	) {
		super(app);
		this.titleEl.setText(title);
	}

	onOpen() {
		const folders = this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && !f.isRoot())
			.map(f => `${f.path}/`)
			.sort();

		this.root = createRoot(this.contentEl);
		this.root.render(
			<React.StrictMode>
				<FiltersView
					app={this.app}
					description={this.description}
					filters={this.filters}
					folders={folders}
					onCancel={() => this.close()}
					onDone={(filters: string[]) => {
						this.close();
						void this.onFiltersChanged(filters);
					}}
				/>
			</React.StrictMode>
		);
	}

	onClose() {
		this.root.unmount();
	}
}

type FiltersViewProps = {
	app: App,
	description: string,
	filters: string[],
	folders: string[],
	onCancel: () => void,
	onDone: (filters: string[]) => void
}

const FiltersView = ({ app, description, filters, folders, onCancel, onDone }: FiltersViewProps) => {
	const [list, setList] = useState(filters);
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const add = useCallback((filter: string) => {
		if (!isValidRE(filter)) return;
		setList(list => list.includes(filter) ? list : [...list, filter]);
		setValue("");
	}, []);

	useEffect(() => {
		if (!inputRef.current) return;
		const suggest = new FilterSuggest(app, inputRef.current, folders, isValidRE, add);
		return () => suggest.close();
	}, [app, folders, add]);

	const isValid = isValidRE(value);
	const desc = isValid || !value
		? "Choose a folder or type a regular expression, then press Enter."
		: "Not a valid regular expression.";

	return <div>
		<div>{description}</div>
		<div className="janitor-filter-list">
			{list.map((filter, i) => (
				<div key={i} className="janitor-filter-row">
					<code className="janitor-filter-text">{filter}</code>
					<span className="clickable-icon janitor-filter-remove" aria-label="Remove filter"
						onClick={() => setList(list => list.filter((_v, index) => index !== i))}><CloseIcon /></span>
				</div>
			))}
		</div>
		<div className="janitor-filter-add">
			<div className="setting-item-name">Add filter</div>
			<div className="setting-item-description">{desc}</div>
			<div className="janitor-filter-add-row">
				<input ref={inputRef} type="text" placeholder="Folder or regular expression"
					value={value} onChange={e => setValue(e.target.value)} />
				<button onClick={() => add(value)} disabled={!isValid}>Add</button>
			</div>
		</div>
		<div className="modal-button-container">
			<button className="mod-cta" onClick={() => onDone(list)}>Done</button>
			<button onClick={onCancel}>Cancel</button>
		</div>
	</div>
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
