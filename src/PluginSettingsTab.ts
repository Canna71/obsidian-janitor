/* eslint-disable @typescript-eslint/no-unused-vars */
import JanitorPlugin from 'main';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

export default class JanitorSettingsTab extends PluginSettingTab {
	plugin: JanitorPlugin;

	constructor(app: App, plugin: JanitorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Janitor Settings'});
		new Setting(containerEl)
			.setName('Run at Startup')
			.setDesc('The plugin will perform a scan automatically everytime you open a vault.')
			.addToggle(bool => bool
				.setValue(this.plugin.settings.runAtStartup)
				.onChange(async (value) => {
					console.log('changing runAtStartup: ', value);
					this.plugin.settings.runAtStartup = value;
					await this.plugin.saveSettings();
				})
				);
		new Setting(containerEl)
			.setName('Ask Confirmation')
			.setDesc('iThe user will be able to select which files to remove')
			.addToggle(bool => bool
				.setValue(this.plugin.settings.promptUser)
				.onChange(async (value) => {
					console.log('changing promptUser: ', value);
					this.plugin.settings.promptUser = value;
					await this.plugin.saveSettings();
				})
				);
		
		new Setting(containerEl)
			.setName("Default Operation")
			.setDesc("Either permanently delete or move to the trash (system or Obsidian)")
			.addDropdown(list => list
				.addOption("")

			)

		new Setting(containerEl)
		.setHeading();

		this.createToggle(containerEl, "Process Orphans",
				"Remove media and attachments that ate not in use",
				"processOrphans"
		);
		this.createToggle(containerEl, "Process Empty",
		"Remove empty files or files with only whitespace",
		"processEmpty"
		);
		this.createToggle(containerEl, "Process Big Files",
		"Removes files with big dimensions",
		"processBig"
		);
		this.createToggle(containerEl, "Process Expired",
		"Remove notes that have expired",
		"processExpired"
		);
	
		if(this.plugin.settings.processExpired)
		{
			containerEl.createEl('h3', { text: 'Expiration Processing'});
			
			new Setting(containerEl)
			// .setDisabled(!this.plugin.settings.processExpired)
			// .setDisabled(true)
			.setName("Metadata Attribute")
			.setDesc("The frontMatter key in which to search for expiration date")
			.addText(date => date
				.setPlaceholder("Insert attribute name (es: expires)")
				.setValue(this.plugin.settings.expiredAttribute)
				// .setDisabled(true)
				.onChange(async value => {
					this.plugin.settings.expiredAttribute = value;
					await this.plugin.saveSettings();
				})
			);
			new Setting(containerEl)
			// .setDisabled(!this.plugin.settings.processExpired)
			// .setDisabled(true)
			.setName("Date Format")
			.setDesc("The format in which the expiration date is stored (e.g. YYYY-MM-DD)")
			.addText(text => text
				.setPlaceholder("Insert the date format")
				.setValue(this.plugin.settings.expiredDateFormat)
				// .setDisabled(true)
				.onChange(async value => {
					this.plugin.settings.expiredDateFormat = value;
					await this.plugin.saveSettings();
				})
			)
		}
	}

	private createToggle(containerEl: HTMLElement, name:string, desc:string, prop:string) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle(bool => bool
				.setValue((this.plugin.settings as any)[prop] as boolean)
				.onChange(async (value) => {
					// console.log('changing processOrphans: ', value);
					(this.plugin.settings as any)[prop] = value;
					await this.plugin.saveSettings();
					this.display();	
				})
			);
	}
}
