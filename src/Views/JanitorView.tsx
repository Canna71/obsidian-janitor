import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { App, getIcon } from "obsidian";
import { OperationType } from "src/JanitorSettings";

export interface SelectableItem {
	selected: boolean,
	name: string,
	resourcePath?: string
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
	onSelectionChange: (i:number,section:string)=>void,
	onOpen: (i:number,section:string)=>void,
	onPerform(operation:string):void,
	onSettingChange:(setting:string, value:any)=>void,
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

function ScanResults({ app, orphans, empty, emptyFolders, big, expired, onSelectionChange, onOpen }:
	{ app: App,
		orphans: SelectableItem[] | false,
		empty: SelectableItem[] | false,
		emptyFolders: SelectableItem[] | false,
		big: SelectableItem[] | false,
		expired: SelectableItem[] | false,
		onSelectionChange:(i:number,section:string)=>void,
		onOpen:(i:number,section:string)=>void,
	}) {

	const handleSelectionChange =
		useCallback((section:string)=>
			useCallback((i:number)=>{
				onSelectionChange(i,section);
			},[onSelectionChange,section])
		,[onSelectionChange])
	;

	const handleOpen =
		useCallback((section:string)=>
			useCallback((i:number)=>{
				onOpen(i,section);
			},[onOpen,section])
		,[onOpen])
	;

	return (
		<div className="janitor-scan-results">
			{orphans && orphans.length>0 && <FileList app={app} files={orphans} onChange={handleSelectionChange("orphans")} onOpen={handleOpen("orphans")} title="Orphans" />}
			{empty && empty.length>0 &&  <FileList app={app} title="Empty" files={empty} onChange={handleSelectionChange("empty")}  onOpen={handleOpen("empty")} />}
			{emptyFolders && emptyFolders.length>0 && <FileList app={app} title="Empty Folders" files={emptyFolders} onChange={handleSelectionChange("emptyFolders")} onOpen={handleOpen("emptyFolders")} showPreview={false} />}
			{expired && expired.length>0 && <FileList app={app} title="Expired" files={expired} onChange={handleSelectionChange("expired")}  onOpen={handleOpen("expired")} />}
			{big && big.length>0 && <FileList app={app} title="Big" files={big} onChange={handleSelectionChange("big")}  onOpen={handleOpen("big")} />}
		</div>
	)
}

const MarqueeText = ({ text }: { text: string }) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const [offset, setOffset] = useState(0);

	useEffect(() => {
		if (containerRef.current && textRef.current) {
			const overflow = textRef.current.scrollWidth - containerRef.current.clientWidth;
			setOffset(Math.max(0, overflow));
		}
	}, [text]);

	return (
		<div ref={containerRef} className="janitor-file-name">
			<span
				ref={textRef}
				className="janitor-file-name-text"
				style={{ '--marquee-offset': `-${offset}px` } as React.CSSProperties}
				title={text}
			>
				{text}
			</span>
		</div>
	);
};

const ObsidianIcon = ({ id }: { id: string }) => {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (ref.current) {
			ref.current.innerHTML = '';
			const svg = getIcon(id);
			if (svg) ref.current.appendChild(svg);
		}
	}, [id]);
	return <span ref={ref} className="janitor-icon" />;
};

const FileList = ({app, files, onChange, onOpen, title, showPreview = true}:{
	app: App,
	files:SelectableItem[],
	onChange:(i:number)=>void,
	onOpen:(i:number)=>void,
	title: string,
	showPreview?: boolean}
	) => {

	const [preview, setPreview] = useState<{ resourcePath: string; x: number; y: number } | null>(null);
	const hoverParent = useRef<{hoverPopover: any}>({ hoverPopover: null }).current;

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

	const handlePreviewEnter = useCallback((resourcePath: string) => (e: React.MouseEvent) => {
		setPreview({ resourcePath, x: e.clientX, y: e.clientY });
	}, []);

	const handlePreviewLeave = useCallback(() => setPreview(null), []);

	const handleMarkdownHover = useCallback((linktext: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
		app.workspace.trigger('hover-link', {
			event: e.nativeEvent,
			source: 'preview',
			hoverParent,
			targetEl: e.target as HTMLElement,
			linktext,
			sourcePath: '/',
		});
	}, [app, hoverParent]);

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

		{files.map((file,i)=>(
			<div key={i} className="janitor-file">
				<label>
				<input
					checked={file.selected}
					value={file.name}
					onChange={handleOnChange(i)}
					type="checkbox" />
				{showPreview && !file.resourcePath && file.name.endsWith('.md') ? (
					<a href="#" className="internal-link janitor-md-preview-link" onMouseOver={handleMarkdownHover(file.name.replace(/\.md$/, ''))} onClick={(e) => e.preventDefault()}>
						<MarqueeText text={file.name} />
					</a>
				) : (
					<MarqueeText text={file.name} />
				)}
				{showPreview && file.resourcePath && (
					<a href="#" className="previewFileIcon" title="Preview" onMouseEnter={handlePreviewEnter(file.resourcePath)} onMouseLeave={handlePreviewLeave}><ObsidianIcon id="eye" /></a>
				)}
				<a href="#" className="openFileIcon" title="Open" onClick={handleOpen(i)}><ObsidianIcon id="arrow-up-right" /></a>
				</label>
			</div>
		))}

		{preview && createPortal(
			<div
				className="janitor-preview-overlay"
				style={{
					left: `${Math.min(preview.x + 15, window.innerWidth - 220)}px`,
					top: `${Math.max(10, preview.y - 150)}px`,
				}}
			>
				<img src={preview.resourcePath} alt="" />
			</div>,
			document.body
		)}
	</div>
	);
}
