import { JanitorSettings, OperationType } from "./JanitorSettings";
import { App, Notice, TFile, normalizePath } from "obsidian";

export class FileProcessor {
	app: App;

	constructor(
		app: App,
		private settings: JanitorSettings
	) {
		this.app = app;
	}

	async process(filenames: string[], operation = OperationType.Trash) {
		// ensures that we don't try to delete the same file twice
		const uniq = [...new Set(filenames)];
		let deletedFiles = 0;
		let notDeletedFiles = 0;

		for (const file of uniq) {
			const entry = this.app.vault.getAbstractFileByPath(file);

			if (!entry) {
				console.warn(`Warning: file ${file} was not found.`);
				notDeletedFiles++;
				continue;
			}

			if (operation === OperationType.Move && !(entry instanceof TFile)) {
				console.warn(`Skipping folder "${file}" when moving.`);
				notDeletedFiles++;
				continue;
			}

			try {
				switch (operation) {

					case OperationType.TrashSystem:
						await this.app.vault.trash(entry, true);
						deletedFiles++;
						break;

					case OperationType.Trash:
						await this.app.vault.trash(entry, false);
						deletedFiles++;
						break;

					case OperationType.Delete:
						await this.app.vault.delete(entry);
						deletedFiles++;
						break;

					case OperationType.Move:
						await this.moveFile(entry as TFile);
						deletedFiles++;
						break;

					default:
						console.warn(`Warning: operation ${operation} unknown`);
						break;
				}
			} catch {
				notDeletedFiles++;
			}
		}
		return { deletedFiles, notDeletedFiles };
	}
	private async moveFile(file: TFile) {

		if (!this.settings.destinationFolder) {
			new Notice("Destination folder is not configured.");
			return;
		}

		const folder = normalizePath(this.settings.destinationFolder);

		if (!this.app.vault.getAbstractFileByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}

		const destination = await this.getUniquePath(
			normalizePath(`${folder}/${file.name}`)
		);

		await this.app.fileManager.renameFile(file, destination);
	}

	private async getUniquePath(path: string): Promise<string> {

		if (!this.app.vault.getAbstractFileByPath(path))
			return path;

		const dot = path.lastIndexOf(".");
		const extension = dot >= 0 ? path.substring(dot) : "";
		const base = dot >= 0 ? path.substring(0, dot) : path;

		let i = 1;

		while (true) {

			const candidate = `${base} (${i})${extension}`;

			if (!this.app.vault.getAbstractFileByPath(candidate))
				return candidate;

			i++;
			}
		}
	}
