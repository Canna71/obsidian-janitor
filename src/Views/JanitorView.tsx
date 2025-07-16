import * as React from "react";
import { useCallback } from "react";
import { OperationType } from "src/JanitorSettings";

export interface SelectableItem {
	selected: boolean,
	name: string
}
export interface JanitorViewProps {
	scanning: boolean,
	orphans: SelectableItem[] | false,
	empty: SelectableItem[] | false,
	big: SelectableItem[] | false,
	expired: SelectableItem[] | false,
	emptyDirectories: SelectableItem[] | false,
	onClose: ()=>void,
	onSelectionChange: (i:number,section:string)=>void,
	onOpen: (i:number,section:string)=>void,

	onPerform(operation:string):void,
	// useSystemTrash: boolean,
	onSettingChange:(setting:string, value:any)=>void
}

export const JanitorView = (props: JanitorViewProps) => {

	// const [state, setState] = useState({
	// 	scanning: true,
	// 	orphans: 0
	// });
	const { scanning, onClose, onPerform } = props;
	const somethingSelected = [props.orphans, props.empty, props.expired, props.big, props.emptyDirectories]
	.some(files => files && files.some(item=>item.selected))



	const handlePerform = useCallback((operation:OperationType)=>useCallback(()=>{
		onPerform(operation);
	},[operation,onPerform]),[onPerform]);
	// const handleTrash = handlePerform(OperationType.Trash);
	// const handleTrashSystem = handlePerform(OperationType.TrashSystem);
	// const handleDelete = handlePerform(OperationType.Delete);
	// caches the handler for each operation type to avoid React
	// complaining of different hooks calls depending on which
	// buttons we are rendering
	const handles:{[op:string]:()=>void} = Object.values(OperationType).reduce((ob, opType)=>{
		return {...ob, [opType]: handlePerform(opType)}
	},{});

	// const handleTrashChange = useCallback(()=>{
	// 	onSettingChange("useSystemTrash", !useSystemTrash);
	// },[onSettingChange,useSystemTrash]);

	return (
		<div className="janitor-modal-wrapper">
			<div className="janitor-modal-title">Janitor Scan Results</div>
			<div className="janitor-modal-content">
				{scanning ? <h4>Scanning...</h4> : <ScanResults {...props} />}
			</div>
			<div className="janitor-modal-footer">
				{/* <div className="janitor-footer-settings">
					<label htmlFor="useSystemTrash">Use System Trash</label>
					<input name="useSystemTrash" id="useSystemTrash" type="checkbox" checked={useSystemTrash} onChange={handleTrashChange} />
				</div> */}
				<div className="janitor-footer-buttons">
					<button tabIndex={1} style={{visibility: somethingSelected ? 'visible' : 'hidden' }} className="" onClick={handles[OperationType.Trash]} title="Put files in the Obsidian .trash" >Trash (Obsidian)</button>
					<button tabIndex={1} style={{visibility: somethingSelected ? 'visible' : 'hidden' }} className="" onClick={handles[OperationType.TrashSystem]} title="Put files in the OS' trash">Trash (System)</button>
					<button tabIndex={1} style={{visibility: somethingSelected ? 'visible' : 'hidden' }} className="" onClick={handles[OperationType.Delete]} title="Permanently delete files">Delete</button>
					<button tabIndex={1} className="mod-cta" onClick={onClose}>Cancel</button>
				</div>
			</div>
		</div>
	)
};
function ScanResults({ orphans,empty,big,expired,emptyDirectories, onSelectionChange, onOpen }:
	{ orphans: SelectableItem[] | false,
		empty: SelectableItem[] | false,
		big: SelectableItem[] | false,
		expired: SelectableItem[] | false,
		emptyDirectories: SelectableItem[] | false,
		onSelectionChange:(i:number,section:string)=>void,
		onOpen:(i:number,section:string)=>void
	}) {

	const handleSelectionChange =
		useCallback((section:string)=>
			useCallback((i:number)=>{
				onSelectionChange(i,section);
			},[onSelectionChange,section])
		,[onSelectionChange ])

	;

	const handleOpen =
		useCallback((section:string)=>
			useCallback((i:number)=>{
				onOpen(i,section);
			},[onOpen,section])
		,[onOpen ])

	;
	return (
		<div className="janitor-scan-results">
			{/* <fieldset> */}
			{orphans && orphans.length>0 && <FileList files={orphans} onChange={handleSelectionChange("orphans")} onOpen={handleOpen("orphans")} title="Orphans" />}
			{empty && empty.length>0 &&  <FileList title="Empty" files={empty} onChange={handleSelectionChange("empty")}  onOpen={handleOpen("empty")} />}
			{expired && expired.length>0 && <FileList title="Expired" files={expired} onChange={handleSelectionChange("expired")}  onOpen={handleOpen("expired")} />}
			{big && big.length>0 && <FileList title="Big" files={big} onChange={handleSelectionChange("big")}  onOpen={handleOpen("big")} />}
			{emptyDirectories && emptyDirectories.length>0 && <FileList title="Empty Folders" files={emptyDirectories} onChange={handleSelectionChange("emptyDirectories")} onOpen={handleOpen("emptyDirectories")} />}
			{/* </fieldset> */}
		</div>

	)

}

const FileList = ({files, onChange, onOpen, title}:{files:SelectableItem[],
	onChange:(i:number)=>void,
	onOpen:(i:number)=>void,
	title: string}
	) => {

	const handleOnChange = useCallback((i:number)=>
		useCallback(
			()=>{
				onChange(i);
			}
		,[onChange,i])
	,[onChange]);

	const handleOpen = useCallback((i:number)=>
	useCallback(
		()=>{
			onOpen(i);
		}
	,[onChange,i])
,[onChange]);
	const allSelected = files.every(file => file.selected);
	const numSelected = files.filter(file => file.selected).length;

	return (<div className="janitor-files-wrapper">
		<div className="janitor-scan-section-title">
			<label title={`Click to ${allSelected?"unselect":"select"} these ${files.length} items`}>
			<input type="checkbox" checked={allSelected} onChange={handleOnChange(-1)} />
			{title} ({files.length} items)
			{(numSelected > 0) && <>&nbsp; ({numSelected} selected)</>}
			</label>

		</div>

		{
			files.map((file,i)=>(
				<div key={i} className="janitor-file">
					<label>
					<input
						checked={file.selected}
						value={file.name}
						onChange={handleOnChange(i)}
						type="checkbox" />
					<span>{file.name}</span>
					<a href="#" className="openFileIcon" onClick={handleOpen(i)} >open</a>
					</label>
				</div>
			))
		}
	</div>
	);
}
