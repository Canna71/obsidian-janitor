import { JanitorSettings } from './JanitorSettings';
import { App, FrontMatterCache, normalizePath, TFile, TFolder } from 'obsidian';
import { CanvasData, CanvasTextData } from "obsidian/canvas"
import { asyncFilter, partition } from './Utils';
import { moment } from "obsidian";
export interface ScanResults {
	scanning: boolean,
	orphans: TFile[],
	empty: TFile[],
	expired: TFile[],
	big: TFile[],
	emptyDirectories: string[]
}

interface IFrontMatter {
	frontMatter: FrontMatterCache;
	stringProps: string[];
	resolvedProps: string[];
	file: TFile;
}

export class FileScanner {
	app: App;
	settings: JanitorSettings;
	// \S is \s negated
	whiteSpaceRegExp = new RegExp('\\S', '');
	constructor(app: App, settings: JanitorSettings) {
		this.app = app;
		this.settings = settings;
	}

	isNote(file: TFile): boolean {
		return file.extension.toLowerCase() === "md" ||
		file.extension.toLowerCase() === "canvas" ;
	}

	isCanvas(file: TFile): boolean {
		return file.extension.toLowerCase() === "canvas" ;
	}
	async scan() {
		const allFiles = this.app.vault.getFiles();
		let exclusionFilters = this.settings.excludedFilesFilters || [];
		//@ts-ignore
		if(this.settings.honorObsidianExcludedFiles && this.app.vault.config.userIgnoreFilters ){
			//@ts-ignore
			exclusionFilters = exclusionFilters.concat(this.app.vault.config.userIgnoreFilters)
		}

		const regexes = exclusionFilters.map<RegExp>((filter:string) => new RegExp(filter,"i"));

		const files = allFiles.filter(file=>{
			return !regexes.some(re=>re.exec(file.path));
		});

		const [notes, others] = partition(files, this.isNote);
		const frontMatters = this.getFrontMatters(notes);
		const orphans = this.settings.processOrphans && await this.findOrphans(notes, others, frontMatters) ;
		const empty = this.settings.processEmpty && await this.findEmpty(files) ;
		const expired = this.settings.processExpired && this.findExpired(frontMatters) ;
		const big = this.settings.processBig && this.findBigFiles(files) ;
		const emptyDirectories = this.settings.processEmptyDirectories && this.findEmptyDirectories() ;

		const results = {
			orphans,
			empty,
			expired,
			big,
			emptyDirectories: emptyDirectories,
			scanning: false
		} as ScanResults;

		return results;
	}

	private findBigFiles(files: TFile[]) {
		return files.filter(file => (file.stat.size >> 10) > this.settings.sizeLimitKb);
	}

	private findEmptyDirectories(): string[] {
		const allDirectories = this.app.vault.getAllLoadedFiles()
			.filter(file => file instanceof TFolder) as TFolder[];

		const emptyDirectories: string[] = [];

		// Check each directory to see if it's empty (recursively)
		for (const directory of allDirectories) {
			if (this.isDirectoryEmpty(directory)) {
				emptyDirectories.push(directory.path);
			}
		}

		return emptyDirectories;
	}

	private isDirectoryEmpty(directory: TFolder): boolean {
		// A directory is considered empty if it has no files and no non-empty subdirectories
		const children = directory.children;

		if (children.length === 0) {
			return true;
		}

		// Check if all children are empty directories
		for (const child of children) {
			if (child instanceof TFile) {
				return false; // Found a file, folder is not empty
			} else if (child instanceof TFolder) {
				if (!this.isDirectoryEmpty(child)) {
					return false; // Found a non-empty subdirectory
				}
			}
		}

		return true; // All children are empty directories or no children
	}

	private findExpired(frontMatters: IFrontMatter[]) {
		const now = moment.now();
		const expired = frontMatters.filter(fm => {
			const expires = fm.frontMatter[this.settings.expiredAttribute] as string | undefined;
			if (expires) {
				//https://day.js.org/docs/en/parse/string-format
				const maybeDate = moment(expires, this.settings.expiredDateFormat);
				if (maybeDate.isValid() && maybeDate.isBefore(now)) {
					return true;
				}

			}
			return false;
		})
			.map(fm => fm.file)
			;
		return expired;
	}

	private async findEmpty(files: TFile[]) {
		const empty = await asyncFilter(files, async file => {
			if (file.stat.size === 0) return true;
			const content = await this.app.vault.cachedRead(file);
			if (!this.whiteSpaceRegExp.test(content)) return true;
			return false;
		});
		return empty;
	}

	private async findOrphans(notes: TFile[], others: TFile[], frontMatters: IFrontMatter[]) {
		const resolvedLinks: { [key: string]: number; } = this.getResolvedLinks();

		const canvasResources = await this.getCanvasResources(notes.filter(this.isCanvas));


		const resolvedResources = this.combineLinksAndResolvedMetadata(frontMatters,
			// resolvedLinks
			{...resolvedLinks, ...canvasResources}
			);



		// now resolvedLinksAndResolvedProps contains all resolved resources:
		// "others" that we collected and are not here are eligible to be purged
		const orphans = this.getOrphans(others, resolvedResources);
		return orphans;
	}

	async getCanvasResources(canvases: TFile[]) {

		const datas = await Promise.all(canvases.map(async file=>{
			const content = await this.app.vault.cachedRead(file);
			const data = JSON.parse(content) as CanvasData

			return data;
		}))

		const regex = /\[\[(.*)\]\]/gm;

		const resources = datas.reduce((acc:{ [key: string]: number; }, data:CanvasData)=>{
			data.nodes.forEach(node => {
				let m;
				const textNode = node as CanvasTextData
				switch (node.type) {
					case "file":
						acc[node.file] = (acc[node.file] || 0) + 1;
						break;
					case "link":
						break;
					case "text":
						m = null;
						while ((m = regex.exec(textNode.text)) !== null) {
							// This is necessary to avoid infinite loops with zero-width matches
							if (m.index === regex.lastIndex) {
								regex.lastIndex++;
							}
							const res = m[1];

							if(res){

								acc[res] = (acc[res] || 0) + 1;
								//@ts-ignore
								const attPath = normalizePath(`${this.app.vault.config.attachmentFolderPath}/${res}`)
								acc[attPath] = (acc[attPath] || 0) + 1;
							}
						}
						break;
				}
			})

			return acc;
		},{})

		// const res = canvases.reduce((acc:{ [key: string]: number; }, file: TFile)=>{
		// 	// TODO: asynch?
		// },{})
		return resources;

	}


	private getOrphans(others: TFile[], resolvedLinksAndResolvedProps: { [key: string]: number; }) {
		return others.filter(file => {
			return !resolvedLinksAndResolvedProps[file.path];
		});
	}

	private combineLinksAndResolvedMetadata(frontMatters: ({ frontMatter: FrontMatterCache; stringProps: string[]; resolvedProps: string[]; file: TFile; } | undefined)[], resolvedLinks: { [key: string]: number; }) {
		return frontMatters.reduce(
			(rl, fm) => {
				if (fm?.resolvedProps?.length) {
					return ({
						...rl,
						...fm.resolvedProps.reduce((ob, val) => ({ ...ob, [val]: 1 }), {})
					});
				} else {
					return rl;
				}
			},
			resolvedLinks
		);
	}

	private getFrontMatters(notes: TFile[]) {
		return notes.map(file => {
			const frontMatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (frontMatter) {
				const stringProps: string[] = extractStringProperties(frontMatter);
				if (stringProps?.length) {
					// we should distinguish files from other props maybe...
					const resolvedProps: string[] = stringProps.map(sp => {
						const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(sp, file.path);
						if (resolvedFile)
							return resolvedFile.path;
					}).filter(sp => !!sp) as string[];
					return {
						frontMatter: frontMatter,
						stringProps,
						resolvedProps,
						file
					};
				}
			}
		}).filter(fm => !!fm) as IFrontMatter[];
	}

	private getResolvedLinks() {
		const resolvedLinks: { [key: string]: number; } = Object.keys(this.app.metadataCache.resolvedLinks).
			reduce((rl: { [key: string]: number; }, fileName: string) => {
				return Object.assign(rl, this.app.metadataCache.resolvedLinks[fileName]);

			}, {});
		return resolvedLinks;
	}
}

function extractStringProperties(fm: any): string[] {
	return Object.values(fm).filter((o: any) => typeof o === 'string') as string[];
}
