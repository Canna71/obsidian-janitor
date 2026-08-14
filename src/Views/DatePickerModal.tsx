import { App, MarkdownView, Modal } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import JanitorPlugin from '../main';
import { moment } from "obsidian";

export class DatePickerModal extends Modal {

	plugin: JanitorPlugin;
	root: Root;
	view: MarkdownView;
	date: string;

	constructor(app: App, plugin: JanitorPlugin, view: MarkdownView) {
		super(app);
		this.plugin = plugin;
		this.view = view;
		this.date = moment().format('YYYY-MM-DD');
	}

	render() {
		this.root.render(
			<React.StrictMode>
				<div className="janitor-date-picker">
					<form onSubmit={this.onApply.bind(this)}>
						<label>
							<span>Choose a date:</span><input type="date" value={this.date} onChange={this.onDateChange.bind(this)} />
						</label>
						<div className="janitor-date-picker-buttons">
							<button type="button" onClick={(e) => this.close()}  >Cancel </button>
							<button className="mod-cta" type="submit" >OK</button>

						</div>
						<div className="janitor-date-shortcuts">
							<button onClick={(e)=>this.dateShortcut(e,1,"weeks")} className="janitor-date-shortcut=button">In a Week</button>
							<button onClick={(e)=>this.dateShortcut(e,1,"months")} className="janitor-date-shortcut=button">In a Month</button>
							<button onClick={(e)=>this.dateShortcut(e,1,"years")} className="janitor-date-shortcut=button">In a Year</button>
						</div>
					</form>

				</div>
			</React.StrictMode>
		);
	}
	dateShortcut(e: React.MouseEvent<HTMLButtonElement>, n: number, what: any) {
		this.date = moment()
			.add(n, what)
			.format('YYYY-MM-DD');
		this.render();
	}

	onApply(event: React.FormEvent) {
		event.preventDefault();
		const dateToSet = moment(this.date, "YYYY-MM-DD").format(this.plugin.settings.expiredDateFormat);
		void this.plugin.updateNoteWithDate(this.view, dateToSet);
		this.close();
		return false;
	}

	onDateChange(event: React.ChangeEvent<HTMLInputElement>) {
		this.date = event.target.value;
		this.render();
	}

	onOpen() {
		const { contentEl } = this;
		this.root = createRoot(contentEl);
		this.render();

	}

	onClose() {
		this.root.unmount();
	}

}
