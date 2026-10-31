import { App, ButtonComponent, MarkdownView, Modal, moment, Setting, TextComponent } from "obsidian";
import JanitorPlugin from '../main';

const ISO_DATE = "YYYY-MM-DD";

/** Asks for an expiration date and writes it to the note's frontmatter. */
export class DatePickerModal extends Modal {
	plugin: JanitorPlugin;
	view: MarkdownView;

	constructor(app: App, plugin: JanitorPlugin, view: MarkdownView) {
		super(app);
		this.plugin = plugin;
		this.view = view;
	}

	onOpen() {
		this.titleEl.setText("Set expiration date");
		let input: TextComponent | undefined;
		new Setting(this.contentEl)
			.setName("Expires on")
			.addText(text => {
				input = text;
				text.inputEl.type = "date";
				text.setValue(moment().format(ISO_DATE));
			});

		const shortcuts = new Setting(this.contentEl).setName("Shortcuts");
		const presets: [string, number, moment.unitOfTime.DurationConstructor][] = [
			["In a week", 1, "weeks"],
			["In a month", 1, "months"],
			["In a year", 1, "years"],
		];
		for (const [label, n, unit] of presets) {
			shortcuts.addButton(button => button
				.setButtonText(label)
				.onClick(() => input?.setValue(moment().add(n, unit).format(ISO_DATE))));
		}

		const apply = () => {
			const date = moment(input?.getValue(), ISO_DATE);
			if (!date.isValid()) return;
			void this.plugin.updateNoteWithDate(this.view, date.format(this.plugin.settings.expiredDateFormat));
			this.close();
		};
		this.scope.register([], "Enter", (evt) => {
			evt.preventDefault();
			apply();
		});

		const buttons = this.contentEl.createDiv("modal-button-container");
		new ButtonComponent(buttons).setButtonText("OK").setCta().onClick(apply);
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
