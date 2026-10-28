import { AbstractInputSuggest, App } from "obsidian";

interface FilterSuggestion {
	value: string;
	/** True for the typed text itself, offered as a new filter. */
	create: boolean;
}

/**
 * Suggests vault folders for a filter input. The typed text comes first when
 * it is a valid regular expression, so Enter adds exactly what was typed.
 */
export class FilterSuggest extends AbstractInputSuggest<FilterSuggestion> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private folders: string[],
		private isValid: (value: string) => boolean,
		private onChoose: (value: string) => void,
	) {
		super(app, inputEl);
		this.limit = 100;
	}

	protected getSuggestions(query: string): FilterSuggestion[] {
		const needle = query.toLowerCase();
		const folders = this.folders
			.filter(f => f.toLowerCase().includes(needle))
			.map(value => ({ value, create: false }));
		if (query && this.isValid(query) && !this.folders.includes(query)) {
			return [{ value: query, create: true }, ...folders];
		}
		return folders;
	}

	renderSuggestion(suggestion: FilterSuggestion, el: HTMLElement) {
		el.setText(suggestion.create ? `Add "${suggestion.value}"` : suggestion.value);
	}

	selectSuggestion(suggestion: FilterSuggestion) {
		this.onChoose(suggestion.value);
		this.close();
	}
}
