import { OperationType } from './JanitorSettings';
import { App, TFolder } from 'obsidian';
export class FileProcessor {
	app: App;

	constructor(app: App) {
		this.app = app;
	}

	async process(filenames: string[], operation = OperationType.Trash) {
		// ensures that we don't try to delete the same file twice
		const uniq = [...new Set(filenames)];
		let deletedFiles = 0;
		let notDeletedFiles = 0;

		for (const file of uniq) {
			const tfile = this.app.vault.getAbstractFileByPath(file);
			if (tfile) {
				try {

					switch (operation) {

						case OperationType.TrashSystem:
							await this.app.vault.trash(tfile, true);
							deletedFiles++;
							break;

						case OperationType.Trash:
							await this.app.vault.trash(tfile, false);
							deletedFiles++;
							break;
						case OperationType.Delete:
							await this.app.vault.delete(tfile);
							deletedFiles++;
							break;
						default:
							console.warn(`Warning: operation ${operation} unknown`);
							break;
					}
				} catch {
					notDeletedFiles++;
				}

			} else {
				console.warn(`Warning: file ${file} was not found for thrashing!`);
				notDeletedFiles++;
			}
		}
		return { deletedFiles, notDeletedFiles };
	}

	async processDirectories(directoriesPaths: string[], operation = OperationType.Trash) {
		// ensures that we don't try to delete the same folder twice
		const uniq = [...new Set(directoriesPaths)];
		let deletedDirectories = 0;
		let notDeletedDirectories = 0;

		for (const directoryPath of uniq) {
			const directory = this.app.vault.getAbstractFileByPath(directoryPath);
			if (directory && directory instanceof TFolder) {
				try {
					switch (operation) {
						case OperationType.TrashSystem:
							await this.app.vault.trash(directory, true);
							deletedDirectories++;
							break;

						case OperationType.Trash:
							await this.app.vault.trash(directory, false);
							deletedDirectories++;
							break;
						case OperationType.Delete:
							await this.app.vault.delete(directory);
							deletedDirectories++;
							break;
						default:
							console.warn(`Warning: operation ${operation} unknown`);
							break;
					}
				} catch {
					notDeletedDirectories++;
				}
			} else {
				console.warn(`Warning: folder ${directoryPath} was not found for deletion!`);
				notDeletedDirectories++;
			}
		}
		return { deletedFiles: deletedDirectories, notDeletedFiles: notDeletedDirectories };
	}
}
