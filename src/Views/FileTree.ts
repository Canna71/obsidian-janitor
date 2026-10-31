import { App, debounce, HoverParent, HoverPopover, setIcon } from "obsidian";

export interface ResultItem {
	path: string,
	size?: number,
	/** Set for images, which get a hover preview. */
	resourcePath?: string,
}

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
	files: ResultItem[];
	count: number;
	size: number;
}

function buildTree(items: ResultItem[]): FolderNode {
	const root: FolderNode = { name: "", path: "", folders: [], files: [], count: 0, size: 0 };
	const byPath = new Map<string, FolderNode>([["", root]]);
	for (const item of items) {
		const parts = item.path.split("/");
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
		node.files.push(item);
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
		node.size = node.files.reduce((n, f) => n + (f.size ?? 0), 0) +
			node.folders.reduce((n, f) => n + f.size, 0);
		node.folders.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
		node.files.sort((a, b) => a.path.localeCompare(b.path));
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

function pathsUnder(node: FolderNode, out: string[] = []) {
	for (const f of node.files) out.push(f.path);
	for (const f of node.folders) pathsUnder(f, out);
	return out;
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
	return `${(bytes / 1048576).toFixed(1)}MB`;
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export interface FileTreeOptions {
	app: App,
	title: string,
	showPreview: boolean,
	/** Shared by every section, so a file listed twice stays in step. */
	selected: Set<string>,
	onSelect: (paths: string[], value: boolean) => void,
	onOpen: (path: string) => void,
	onIgnore: (path: string, isFolder: boolean) => void,
}

/**
 * One section of the scan results, drawn as a folder tree. Only expanded
 * folders are drawn, so a section can hold tens of thousands of files.
 */
export class FileTree implements HoverParent {
	hoverPopover: HoverPopover | null = null;

	private items: ResultItem[];
	private filter = "";
	private tree: FolderNode;
	private expanded = new Set<string>();
	private shown = new Map<string, number>();
	/** Rows currently drawn, so a selection change updates them in place. */
	private rows: { checkbox: HTMLInputElement, node?: FolderNode, path?: string }[] = [];

	private headerCheckbox: HTMLInputElement;
	private headerCount: HTMLElement;
	private matchEl: HTMLElement;
	private treeEl: HTMLElement;
	private previewEl: HTMLElement | null = null;
	private wrapper: HTMLElement;

	constructor(private containerEl: HTMLElement, items: ResultItem[], private opts: FileTreeOptions) {
		this.items = items;
		const wrapper = this.wrapper = containerEl.createDiv("janitor-files-wrapper");

		const header = wrapper.createEl("label", { cls: "janitor-scan-section-title" });
		this.headerCheckbox = header.createEl("input", { type: "checkbox" });
		this.headerCheckbox.addEventListener("change", () => {
			opts.onSelect(this.items.map(i => i.path), this.headerCheckbox.checked);
		});
		header.createSpan({ text: opts.title });
		this.headerCount = header.createSpan({ cls: "janitor-tree-meta" });

		if (items.length > EXPAND_ALL_LIMIT) {
			const input = wrapper.createEl("input", {
				type: "search",
				cls: "janitor-tree-filter",
				attr: { placeholder: "Filter by path" },
			});
			input.addEventListener("input", debounce(() => this.setFilter(input.value), 200, true));
		}
		this.matchEl = wrapper.createDiv("janitor-tree-meta");
		this.treeEl = wrapper.createDiv("janitor-tree");

		this.tree = this.buildFiltered();
		this.resetExpansion();
		this.draw();
	}

	/** Replaces the items, e.g. after an ignore, keeping folders open. */
	setItems(items: ResultItem[]) {
		this.items = items;
		this.tree = this.buildFiltered();
		this.draw();
		this.wrapper.toggle(items.length > 0);
	}

	/** Updates checkboxes and counts after the shared selection changed. */
	refreshSelection() {
		const selectedUnder = this.countSelected();
		for (const row of this.rows) {
			if (row.node) {
				const n = selectedUnder.get(row.node) ?? 0;
				row.checkbox.checked = n === row.node.count;
				row.checkbox.indeterminate = n > 0 && n < row.node.count;
			} else if (row.path) {
				row.checkbox.checked = this.opts.selected.has(row.path);
			}
		}
		const total = this.items.filter(i => this.opts.selected.has(i.path)).length;
		this.headerCheckbox.checked = total > 0 && total === this.items.length;
		this.headerCheckbox.indeterminate = total > 0 && total < this.items.length;
		this.headerCount.setText(
			` (${this.items.length.toLocaleString()} items` +
			(total ? `, ${total.toLocaleString()} selected)` : ")")
		);
	}

	private setFilter(filter: string) {
		this.filter = filter.trim().toLowerCase();
		this.tree = this.buildFiltered();
		this.resetExpansion();
		this.draw();
	}

	private buildFiltered() {
		const needle = this.filter;
		return buildTree(needle ? this.items.filter(i => i.path.toLowerCase().includes(needle)) : this.items);
	}

	private resetExpansion() {
		const limit = this.filter ? EXPAND_FILTERED_LIMIT : EXPAND_ALL_LIMIT;
		this.expanded = this.tree.count <= limit ? allFolderPaths(this.tree) : new Set();
		this.shown.clear();
	}

	private countSelected() {
		const counts = new Map<FolderNode, number>();
		const walk = (node: FolderNode): number => {
			let n = node.files.reduce((c, f) => c + (this.opts.selected.has(f.path) ? 1 : 0), 0);
			for (const f of node.folders) n += walk(f);
			counts.set(node, n);
			return n;
		};
		walk(this.tree);
		return counts;
	}

	private draw() {
		this.treeEl.empty();
		this.rows = [];
		this.matchEl.setText(this.filter ? `${this.tree.count.toLocaleString()} match` : "");
		this.drawContents(this.tree, 0);
		this.refreshSelection();
	}

	private drawContents(node: FolderNode, depth: number) {
		for (const f of node.folders) this.drawFolder(f, depth);
		const limit = this.shown.get(node.path) ?? PAGE_SIZE;
		for (const f of node.files.slice(0, limit)) this.drawFile(f, depth);
		if (node.files.length > limit) {
			const row = this.row(depth);
			const hidden = node.files.length - limit;
			row.createEl("button", {
				cls: "janitor-show-more",
				text: `Show ${Math.min(PAGE_SIZE, hidden)} more (${hidden} hidden)`,
			}).addEventListener("click", () => {
				this.shown.set(node.path, limit + PAGE_SIZE);
				this.draw();
			});
		}
	}

	private row(depth: number, cls?: string) {
		const row = this.treeEl.createDiv({ cls: ["janitor-tree-row", ...(cls ? [cls] : [])] });
		row.style.setProperty("--janitor-depth", String(depth));
		return row;
	}

	private action(parent: HTMLElement, icon: string, label: string, onClick: (evt: MouseEvent) => void) {
		const el = parent.createSpan({ cls: "clickable-icon", attr: { "aria-label": label } });
		setIcon(el, icon);
		el.addEventListener("click", onClick);
		return el;
	}

	private drawFolder(node: FolderNode, depth: number) {
		const isOpen = this.expanded.has(node.path);
		const row = this.row(depth, "janitor-tree-folder");
		const checkbox = row.createEl("input", { type: "checkbox" });
		checkbox.addEventListener("change", () => {
			this.opts.onSelect(pathsUnder(node), checkbox.checked);
		});
		this.rows.push({ checkbox, node });

		const name = row.createSpan({ cls: "janitor-tree-name", attr: { title: node.path } });
		const caret = name.createSpan("janitor-tree-caret");
		setIcon(caret, isOpen ? "chevron-down" : "chevron-right");
		name.appendText(`${node.name}/`);
		name.addEventListener("click", () => {
			if (isOpen) this.expanded.delete(node.path); else this.expanded.add(node.path);
			this.draw();
		});

		row.createSpan({ cls: "janitor-tree-meta", text: `${node.count.toLocaleString()} · ${formatSize(node.size)}` });
		const actions = row.createSpan("janitor-tree-actions");
		this.action(actions, "eye-off", "Add folder to ignore list", () => this.opts.onIgnore(node.path, true));

		if (isOpen) this.drawContents(node, depth + 1);
	}

	private drawFile(item: ResultItem, depth: number) {
		const row = this.row(depth, "janitor-tree-file");
		const label = row.createEl("label", { attr: { title: item.path } });
		const checkbox = label.createEl("input", { type: "checkbox" });
		checkbox.addEventListener("change", () => this.opts.onSelect([item.path], checkbox.checked));
		this.rows.push({ checkbox, path: item.path });

		const name = label.createSpan({ cls: "janitor-tree-name", text: basename(item.path) });
		if (this.opts.showPreview && !item.resourcePath && item.path.endsWith(".md")) {
			name.addClass("internal-link");
			name.addEventListener("mouseover", (event) => {
				this.opts.app.workspace.trigger("hover-link", {
					event,
					source: "preview",
					hoverParent: this,
					targetEl: name,
					linktext: item.path.replace(/\.md$/, ""),
					sourcePath: "/",
				});
			});
		}

		if (item.size !== undefined) row.createSpan({ cls: "janitor-tree-meta", text: formatSize(item.size) });
		const actions = row.createSpan("janitor-tree-actions");
		if (this.opts.showPreview && item.resourcePath) {
			const resourcePath = item.resourcePath;
			const eye = this.action(actions, "eye", "Preview", () => {});
			eye.addEventListener("mouseenter", (e) => this.showPreview(resourcePath, e));
			eye.addEventListener("mouseleave", () => this.hidePreview());
		}
		this.action(actions, "eye-off", "Add to ignore list", () => this.opts.onIgnore(item.path, false));
		this.action(actions, "arrow-up-right", "Open", () => this.opts.onOpen(item.path));
	}

	private showPreview(resourcePath: string, e: MouseEvent) {
		this.hidePreview();
		const doc = this.containerEl.doc;
		this.previewEl = doc.body.createDiv("janitor-preview-overlay");
		this.previewEl.style.setProperty("--janitor-preview-left", `${Math.min(e.clientX + 15, doc.win.innerWidth - 220)}px`);
		this.previewEl.style.setProperty("--janitor-preview-top", `${Math.max(10, e.clientY - 150)}px`);
		this.previewEl.createEl("img", { attr: { src: resourcePath, alt: "" } });
	}

	hidePreview() {
		this.previewEl?.remove();
		this.previewEl = null;
	}
}
