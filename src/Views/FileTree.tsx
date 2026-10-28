import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { App, getIcon } from "obsidian";
import { SelectableItem } from "./JanitorView";

/** Files drawn per folder before a "show more" row. */
const PAGE_SIZE = 200;
/** Sections at or below this size open fully expanded. */
const EXPAND_ALL_LIMIT = 50;
/** A filter that matches at most this many files expands every folder. */
const EXPAND_FILTERED_LIMIT = 500;

interface FolderNode {
	/** Display name; single-child folder chains are merged, e.g. "a/b/c". */
	name: string;
	path: string;
	folders: FolderNode[];
	/** Indices into the section's item list. */
	files: number[];
	count: number;
	size: number;
}

function buildTree(items: SelectableItem[], indices: number[]): FolderNode {
	const root: FolderNode = { name: "", path: "", folders: [], files: [], count: 0, size: 0 };
	const byPath = new Map<string, FolderNode>([["", root]]);
	for (const i of indices) {
		const parts = items[i].name.split("/");
		let node = root;
		let path = "";
		for (const part of parts.slice(0, -1)) {
			path = path ? `${path}/${part}` : part;
			let child = byPath.get(path);
			if (!child) {
				child = { name: part, path, folders: [], files: [], count: 0, size: 0 };
				byPath.set(path, child);
				node.folders.push(child);
			}
			node = child;
		}
		node.files.push(i);
	}
	const finish = (node: FolderNode): FolderNode => {
		node.folders = node.folders.map(child => {
			while (child.files.length === 0 && child.folders.length === 1) {
				const only = child.folders[0];
				child = { ...only, name: `${child.name}/${only.name}` };
			}
			return finish(child);
		});
		node.count = node.files.length + node.folders.reduce((n, f) => n + f.count, 0);
		node.size = node.files.reduce((n, i) => n + (items[i].size ?? 0), 0) +
			node.folders.reduce((n, f) => n + f.size, 0);
		node.folders.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
		node.files.sort((a, b) => items[a].name.localeCompare(items[b].name));
		return node;
	};
	return finish(root);
}

function allFolderPaths(node: FolderNode, out: Set<string> = new Set()) {
	for (const f of node.folders) {
		out.add(f.path);
		allFolderPaths(f, out);
	}
	return out;
}

function filesUnder(node: FolderNode, items: SelectableItem[], out: string[] = []) {
	for (const i of node.files) out.push(items[i].name);
	for (const f of node.folders) filesUnder(f, items, out);
	return out;
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
	return `${(bytes / 1048576).toFixed(1)}MB`;
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const ObsidianIcon = ({ id }: { id: string }) => {
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

const TriStateCheckbox = ({ checked, indeterminate, onChange }:
	{ checked: boolean, indeterminate: boolean, onChange: () => void }) => {
	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (ref.current) ref.current.indeterminate = indeterminate;
	}, [indeterminate]);
	return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
};

export interface FileTreeProps {
	app: App,
	files: SelectableItem[],
	title: string,
	showPreview?: boolean,
	onSelect: (paths: string[], value: boolean) => void,
	onOpen: (path: string) => void,
	onIgnore: (path: string, isFolder: boolean) => void,
}

export const FileTree = ({ app, files, title, showPreview = true, onSelect, onOpen, onIgnore }: FileTreeProps) => {
	const [filter, setFilter] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [shown, setShown] = useState<Record<string, number>>({});
	const [preview, setPreview] = useState<{ resourcePath: string; x: number; y: number } | null>(null);
	const hoverParent = useRef<{ hoverPopover: any }>({ hoverPopover: null }).current;

	// The tree depends on which paths are present, not on what is selected,
	// so it is rebuilt only when the file list or the filter changes.
	const pathsKey = useMemo(() => files.map(f => f.name).join("\n"), [files]);
	const tree = useMemo(() => {
		const needle = filter.trim().toLowerCase();
		const indices = files
			.map((_f, i) => i)
			.filter(i => !needle || files[i].name.toLowerCase().includes(needle));
		return buildTree(files, indices);
	}, [pathsKey, filter]);

	// Reset expansion when the filter changes, not when an ignore removes
	// items, so the folder the user is working in stays open.
	useEffect(() => {
		const limit = filter.trim() ? EXPAND_FILTERED_LIMIT : EXPAND_ALL_LIMIT;
		setExpanded(tree.count <= limit ? allFolderPaths(tree) : new Set());
		setShown({});
	}, [filter]);

	const selectedUnder = useMemo(() => {
		const counts = new Map<FolderNode, number>();
		const walk = (node: FolderNode): number => {
			let n = node.files.reduce((c, i) => c + (files[i].selected ? 1 : 0), 0);
			for (const f of node.folders) n += walk(f);
			counts.set(node, n);
			return n;
		};
		walk(tree);
		return counts;
	}, [tree, files]);

	const toggleExpanded = useCallback((path: string) => {
		setExpanded(prev => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path); else next.add(path);
			return next;
		});
	}, []);

	const toggleFolder = (node: FolderNode) => {
		const all = selectedUnder.get(node) === node.count;
		onSelect(filesUnder(node, files), !all);
	};

	const handleMarkdownHover = (linktext: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
		app.workspace.trigger('hover-link', {
			event: e.nativeEvent,
			source: 'preview',
			hoverParent,
			targetEl: e.target as HTMLElement,
			linktext,
			sourcePath: '/',
		});
	};

	const renderFile = (i: number, depth: number) => {
		const file = files[i];
		const name = basename(file.name);
		return (
			<div key={file.name} className="janitor-tree-row" style={{ paddingLeft: `${depth * 1.2 + 1.4}em` }}>
				<label title={file.name}>
					<input type="checkbox" checked={file.selected} onChange={() => onSelect([file.name], !file.selected)} />
					{showPreview && !file.resourcePath && file.name.endsWith('.md') ? (
						<a href="#" className="internal-link janitor-md-preview-link janitor-tree-name"
							onMouseOver={handleMarkdownHover(file.name.replace(/\.md$/, ''))}
							onClick={(e) => e.preventDefault()}>{name}</a>
					) : (
						<span className="janitor-tree-name">{name}</span>
					)}
				</label>
				{file.size !== undefined && <span className="janitor-tree-meta">{formatSize(file.size)}</span>}
				<span className="janitor-tree-actions">
					{showPreview && file.resourcePath && (
						<a href="#" title="Preview"
							onMouseEnter={(e) => setPreview({ resourcePath: file.resourcePath as string, x: e.clientX, y: e.clientY })}
							onMouseLeave={() => setPreview(null)}><ObsidianIcon id="eye" /></a>
					)}
					<a href="#" title="Add to ignore list" onClick={(e) => { e.preventDefault(); onIgnore(file.name, false); }}><ObsidianIcon id="eye-off" /></a>
					<a href="#" title="Open" onClick={(e) => { e.preventDefault(); onOpen(file.name); }}><ObsidianIcon id="arrow-up-right" /></a>
				</span>
			</div>
		);
	};

	const renderFolderContents = (node: FolderNode, depth: number): React.ReactNode[] => {
		const rows: React.ReactNode[] = [];
		for (const f of node.folders) rows.push(...renderFolder(f, depth));
		const limit = shown[node.path] ?? PAGE_SIZE;
		for (const i of node.files.slice(0, limit)) rows.push(renderFile(i, depth));
		if (node.files.length > limit) {
			rows.push(
				<div key={`${node.path}/:more`} className="janitor-tree-row" style={{ paddingLeft: `${depth * 1.2 + 1.4}em` }}>
					<button className="janitor-show-more" onClick={() => setShown({ ...shown, [node.path]: limit + PAGE_SIZE })}>
						Show {Math.min(PAGE_SIZE, node.files.length - limit)} more ({node.files.length - limit} hidden)
					</button>
				</div>
			);
		}
		return rows;
	};

	const renderFolder = (node: FolderNode, depth: number): React.ReactNode[] => {
		const isOpen = expanded.has(node.path);
		const selected = selectedUnder.get(node) ?? 0;
		const row = (
			<div key={`${node.path}/`} className="janitor-tree-row janitor-tree-folder" style={{ paddingLeft: `${depth * 1.2}em` }}>
				<TriStateCheckbox
					checked={selected === node.count}
					indeterminate={selected > 0 && selected < node.count}
					onChange={() => toggleFolder(node)} />
				<span className="janitor-tree-name" title={node.path} onClick={() => toggleExpanded(node.path)}>
					<span className="janitor-tree-caret">{isOpen ? "▾" : "▸"}</span>{node.name}/
				</span>
				<span className="janitor-tree-meta">{node.count.toLocaleString()} · {formatSize(node.size)}</span>
				<span className="janitor-tree-actions">
					<a href="#" title="Add folder to ignore list" onClick={(e) => { e.preventDefault(); onIgnore(node.path, true); }}><ObsidianIcon id="eye-off" /></a>
				</span>
			</div>
		);
		return isOpen ? [row, ...renderFolderContents(node, depth + 1)] : [row];
	};

	const totalSelected = selectedUnder.get(tree) ?? 0;
	const allSelected = files.length > 0 && files.every(f => f.selected);

	return (<div className="janitor-files-wrapper">
		<div className="janitor-scan-section-title">
			<label title={`Click to ${allSelected ? "unselect" : "select"} these ${files.length} items`}>
				<input type="checkbox" checked={allSelected} onChange={() => onSelect(files.map(f => f.name), !allSelected)} />
				{title} ({files.length.toLocaleString()} items)
				{totalSelected > 0 && <>&nbsp; ({totalSelected.toLocaleString()} selected)</>}
			</label>
		</div>
		{files.length > EXPAND_ALL_LIMIT && (
			<input type="search" className="janitor-tree-filter" placeholder="Filter by path"
				value={filter} onChange={(e) => setFilter(e.target.value)} />
		)}
		{filter.trim() && <div className="janitor-tree-meta">{tree.count.toLocaleString()} match</div>}
		<div className="janitor-tree">{renderFolderContents(tree, 0)}</div>

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
	</div>);
};
