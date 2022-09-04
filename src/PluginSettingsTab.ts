import { DEFAULT_SETTINGS } from 'src/JanitorSettings';
import JanitorPlugin from 'main';
import { App, PluginSettingTab, Setting } from 'obsidian';

export default class JanitorSettingsTab extends PluginSettingTab {
	plugin: JanitorPlugin;

	constructor(app: App, plugin: JanitorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Janitor Settings' });

		this.createToggle(containerEl, "Add Ribbon Icon",
			"Adds an icon to the ribbon to launch scan",
			"addRibbonIcon"
		);

		this.createToggle(containerEl, "Run at Startup",
			"The plugin will perform a scan automatically everytime you open a vault.",
			"runAtStartup"
		);

		this.createToggle(containerEl, "Ask Confirmation",
			"The user will be able to select which files to remove",
			"promptUser"
		);


		new Setting(containerEl)
			.setName('Always Prompt for big files')
			.setDesc('Always prompt before deleting big files')
			.addToggle(bool => bool
				.setValue(this.plugin.settings.promptForBigFiles)
				.onChange(async (value) => {
					this.plugin.settings.promptForBigFiles = value;
					await this.plugin.saveSettings();
				})
			);


		new Setting(containerEl)
			.setHeading();

		this.createToggle(containerEl, "Process Orphans",
			"Remove media and attachments that are not in use",
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

		if (this.plugin.settings.processBig) {
			new Setting(containerEl)
				.setName("File Size Limit (KB)")
				.setDesc("Files larger than this size will be considered for removal.")
				.addText(num => num
					.setValue(this.plugin.settings.sizeLimitKb.toString())
					.onChange(async value => {
						const num = parseInt(value);
						if (isFinite(num)) {
							this.plugin.settings.sizeLimitKb = num;
						} else {
							this.plugin.settings.sizeLimitKb = DEFAULT_SETTINGS.sizeLimitKb;
						}
						await this.plugin.saveSettings();
					})
				)
		}


		this.createToggle(containerEl, "Process Expired",
			"Remove notes that have expired",
			"processExpired"
		);

		if (this.plugin.settings.processExpired) {
			containerEl.createEl('h3', { text: 'Expiration Processing' });

			new Setting(containerEl)
				.setName("Metadata Attribute")
				.setDesc("The frontMatter key in which to search for expiration date")
				.addText(date => date
					.setPlaceholder("Insert attribute name (es: expires)")
					.setValue(this.plugin.settings.expiredAttribute)
					.onChange(async value => {
						this.plugin.settings.expiredAttribute = value;
						await this.plugin.saveSettings();
					})
				);
			new Setting(containerEl)
				.setName("Date Format")
				.setDesc("The format in which the expiration date is stored (e.g. YYYY-MM-DD)")
				.addText(text => text
					.setPlaceholder("Insert the date format")
					.setValue(this.plugin.settings.expiredDateFormat)
					.onChange(async value => {
						this.plugin.settings.expiredDateFormat = value;
						await this.plugin.saveSettings();
					})
				)
		}
	}

	private createToggle(containerEl: HTMLElement, name: string, desc: string, prop: string) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle(bool => bool
				.setValue((this.plugin.settings as any)[prop] as boolean)
				.onChange(async (value) => {
					(this.plugin.settings as any)[prop] = value;
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}
}
