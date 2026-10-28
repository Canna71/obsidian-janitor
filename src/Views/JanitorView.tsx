import * as React from "react";
import { useCallback } from "react";
import { App } from "obsidian";
import { OperationType } from "src/JanitorSettings";
import { FileTree } from "./FileTree";

export interface SelectableItem {
	selected: boolean,
	name: string,
	resourcePath?: string,
	size?: number
}
export interface JanitorViewProps {
	app: App,
	scanning: boolean,
	orphans: SelectableItem[] | false,
	empty: SelectableItem[] | false,
	emptyFolders: SelectableItem[] | false,
	big: SelectableItem[] | false,
	expired: SelectableItem[] | false,
	onClose: ()=>void,
	onSelect: (paths:string[], value:boolean)=>void,
	onOpen: (path:string)=>void,
	onIgnore: (path:string, isFolder:boolean)=>void,
	onPerform: (operation:string)=>void,
}

export const JanitorView = (props: JanitorViewProps) => {

	const { scanning, onClose, onPerform } = props;
	const somethingSelected = [props.orphans, props.empty, props.emptyFolders, props.expired, props.big]
	.some(files => files && files.some(item=>item.selected))

	const handlePerform = useCallback((operation:OperationType)=>useCallback(()=>{
		onPerform(operation);
	},[operation,onPerform]),[onPerform]);
	const handles:{[op:string]:()=>void} = Object.values(OperationType).reduce((ob, opType)=>{
		return {...ob, [opType]: handlePerform(opType)}
	},{});

	return (
		<div className="janitor-modal-wrapper">
			<div className="janitor-modal-title">Janitor Scan Results</div>
			<div className="janitor-modal-content">
				{scanning ? <h4>Scanning...</h4> : <ScanResults {...props} />}
			</div>
			<div className="janitor-modal-footer">
				<div className="janitor-footer-buttons">
					<button tabIndex={1} style={{visibility: somethingSelected ? 'visible' : 'hidden' }} className="" onClick={handles[OperationType.Trash]} title="Put files in the Obsidian .trash" >Trash (Obsidian)</button>
					<button tabIndex={1} style={{visibility: somethingSelected ? 'visible' : 'hidden' }} className="" onClick={handles[OperationType.TrashSystem]} title="Put files in the OS' trash">Trash (system)</button>
					<button tabIndex={1} style={{visibility: somethingSelected ? 'visible' : 'hidden' }} className="" onClick={handles[OperationType.Delete]} title="Permanently delete files">Delete</button>
					<button tabIndex={1} className="mod-cta" onClick={onClose}>Cancel</button>
				</div>
			</div>
		</div>
	)
};

function ScanResults({ app, orphans, empty, emptyFolders, big, expired, onSelect, onOpen, onIgnore }: JanitorViewProps) {
	const common = { app, onSelect, onOpen, onIgnore };
	return (
		<div className="janitor-scan-results">
			{orphans && orphans.length>0 && <FileTree {...common} files={orphans} title="Orphans" />}
			{empty && empty.length>0 && <FileTree {...common} files={empty} title="Empty" />}
			{emptyFolders && emptyFolders.length>0 && <FileTree {...common} files={emptyFolders} title="Empty Folders" showPreview={false} />}
			{expired && expired.length>0 && <FileTree {...common} files={expired} title="Expired" />}
			{big && big.length>0 && <FileTree {...common} files={big} title="Big" />}
		</div>
	)
}
