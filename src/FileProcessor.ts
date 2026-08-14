import { OperationType } from './JanitorSettings';
import { App } from 'obsidian';
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

					// obsidianmd/prefer-file-manager-trash-file asks for
					// FileManager.trashFile(), so that the user's "Deleted files"
					// preference decides the destination. Janitor asks the user which
					// destination they want instead - the review modal offers all three
					// as separate buttons - so honouring that choice means addressing
					// the vault directly.
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
							console.warn(`Warning: operation ${String(operation)} unknown`);
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
}
