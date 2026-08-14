
import * as React from "react";
import { App, Modal } from "obsidian";
import { JanitorSettings } from "src/JanitorSettings";
import { createRoot, Root } from "react-dom/client";
import CloseIcon from "../svg/close.svg";
import { useCallback, useRef, useState } from "react";
import { SettingControl, SettingItem, SettingsInfo } from "./SettingControls";
import { getFolders } from "src/Utils";
import { SelectObs } from "./Select";

export class ExcludedFilesModal extends Modal {
	settings: JanitorSettings;
	root: Root;
	onFiltersChanged: (filters: string[]) => Promise<void>;
	

	constructor(app: App, settings: JanitorSettings, onFiltersChanged: (filters:string[])=>Promise<void>) {
		super(app);
		this.settings = settings;
		this.titleEl.setText("Janitor excluded files");
		this.onFiltersChanged = onFiltersChanged;
	}



	render() {
		const folders = getFolders(this.app).map(f => ({
			value: f.endsWith("/") ? f : f + "/",

			label: f
		}));

		this.root.render(
			<React.StrictMode>
				<ExcudedFilesView
					filters={this.settings.excludedFilesFilters}
					folders={folders}
					onCancel={()=>{this.close()}}
					onFilterChanged={(filters:string[])=>{
						this.close();
						if (this.onFiltersChanged) void this.onFiltersChanged(filters);
					}}
				/>
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
}

type ExcudedFilesViewProps = {
	filters: string[],
	folders: {
		value: string;
		label: string;
	}[],
	onCancel: ()=>void,
	onFilterChanged: (filters:string[])=>void
}
// https://stackoverflow.com/questions/54890660/react-select-dropdown-opens-inside-modal
// https://stackoverflow.com/questions/57089251/react-select-can-not-overlay-react-modal
const ExcudedFilesView = ({ filters, folders, onCancel, onFilterChanged }: ExcudedFilesViewProps) => {

	const [state, setState] = useState({
		filters,
		value: ""
	});
	const list = state.filters;

	// const [currentValue, updateValue] = useState("");
	const ref = useRef<HTMLDivElement>(null);

	const onAdd = useCallback((e: React.MouseEvent) => {
		setState(state => {
			if(!isValidRE(state.value)) return state;
			return ({
				...state,
				filters: [...state.filters, state.value],
				value: ""
			})
		})
	}, []) 

	const onChange = useCallback((newValue: any, actionMeta: any) => {

		if (actionMeta.action === "select-option" || actionMeta.action === "create-option") {
			setState(state => {
				if(!isValidRE(newValue.value)) return state;


				return ({
					...state,
					filters: [...state.filters, newValue.value],
					value: ""
				})
			})
		}
	}, []);

	const onInputChange = useCallback((newValue: unknown, actionMeta: any) => {

		if (actionMeta.action === "input-change") {
			setState(state => ({ ...state, value: newValue as string }));
		}
	}, [])

	const onDelete = useCallback((i:number)=>{
		setState(state=>{

			return ({
				...state,
				filters: state.filters.filter((v,index)=>!(i===index))
			})
		})
	},[]);

	const onDone = useCallback(()=>{
		onFilterChanged && onFilterChanged(state.filters);
	},[state.filters]);


	const isValid = isValidRE(state.value);
	const desc = isValid ? "Press enter or button to add filter" : "insert a valid regular expression"

	return <div ref={ref}>
		<div>Files matching the following regular expressions are currently ignored:</div>
		{list.map((filter, i) => (
			<div key={i} className="mobile-option-setting-item">
				<span className="mobile-option-setting-item-name">{filter}</span>
				<span className="mobile-option-setting-item-option-icon" onClick={()=>onDelete(i)}><CloseIcon /></span>
			</div>
		))}
		<SettingItem>
			<SettingsInfo name="Filter" description={desc} />
			<SettingControl>
				<SelectObs
					key={filters.length}
					value={state.value}
					container={document.body}
					options={folders}
					placeholder="Insert folder or regex..."
					newLabel={`Add "{0}"`}
					onChange={onChange}
					onInputChange={onInputChange}
				/>
				<button onClick={onAdd} disabled={!isValid}>Add</button>
			</SettingControl>
		</SettingItem>
		<div className="modal-button-container">
			<button className="mod-cta" onClick={onDone}>Done</button>
			<button onClick={onCancel}>Cancel</button></div>
	</div>
}


function isValidRE(value: string) {
	let isValid = value.length > 0;

	try {
		new RegExp(value);
	} catch {
		isValid = false;
	}
	return isValid;
}

