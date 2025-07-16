import { ExcludedFilesModal } from './Views/ExcludedFilesModal';
import { DEFAULT_SETTINGS } from "src/JanitorSettings";
import JanitorPlugin from "./main";
import { App, PluginSettingTab, Setting } from "obsidian";

export default class JanitorSettingsTab extends PluginSettingTab {
	plugin: JanitorPlugin;

	constructor(app: App, plugin: JanitorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Janitor settings" });


		new Setting(containerEl)
			.setName("Add ribbon icon")
			.setDesc("Adds an icon to the ribbon to launch scan")
			.addToggle(bool => bool
				.setValue(this.plugin.settings.addRibbonIcon)
				.onChange(async (value) => {
					this.plugin.settings.addRibbonIcon = value;
					await this.plugin.saveSettings();
                    if(value){
                        this.plugin.addIcon();
                    } else {
                        this.plugin.removeIcon();
                    }
					this.display();
				})
			);

		this.createToggle(
			containerEl,
			"Run at startup",
			"The plugin will perform a scan automatically everytime you open a vault.",
			"runAtStartup"
		);


		this.createToggle(
			containerEl,
			"Ask confirmation",
			"The user will be able to select which files to remove",
			"promptUser"
		);

		new Setting(containerEl)
			.setName("Always prompt for big files")
			.setDesc("Always prompt before deleting big files")
			.addToggle((bool) =>
				bool
					.setValue(this.plugin.settings.promptForBigFiles)
					.onChange(async (value) => {
						this.plugin.settings.promptForBigFiles = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setHeading();

		this.createToggle(
			containerEl,
			"Process orphans",
			"Remove media and attachments that are not in use",
			"processOrphans"
		);
		this.createToggle(
			containerEl,
			"Process empty files",
			"Remove empty files or files with only whitespace",
			"processEmpty"
		);
		this.createToggle(
			containerEl,
			"Process empty directories",
			"Remove empty directories from the vault",
			"processEmptyDirectories"
		);
		this.createToggle(
			containerEl,
			"Process big files",
			"Removes files with big dimensions",
			"processBig"
		);

		if (this.plugin.settings.processBig) {
			new Setting(containerEl)
				.setName("File size limit (KB)")
				.setDesc(
					"Files larger than this size will be considered for removal."
				)
				.addText((num) =>
					num
						.setValue(this.plugin.settings.sizeLimitKb.toString())
						.onChange(async (value) => {
							const num = parseInt(value);
							if (isFinite(num)) {
								this.plugin.settings.sizeLimitKb = num;
							} else {
								this.plugin.settings.sizeLimitKb =
									DEFAULT_SETTINGS.sizeLimitKb;
							}
							await this.plugin.saveSettings();
						})
				);
		}

		this.createToggle(
			containerEl,
			"Process expired",
			"Remove notes that have expired",
			"processExpired"
		);

		if (this.plugin.settings.processExpired) {
			containerEl.createEl("h3", { text: "Expiration processing" });

			new Setting(containerEl)
				.setName("Metadata attribute")
				.setDesc(
					"The frontMatter key in which to search for expiration date"
				)
				.addText((date) =>
					date
						.setPlaceholder("Insert attribute name (es: expires)")
						.setValue(this.plugin.settings.expiredAttribute)
						.onChange(async (value) => {
							this.plugin.settings.expiredAttribute = value;
							await this.plugin.saveSettings();
						})
				);
			new Setting(containerEl)
				.setName("Date format")
				.setDesc(
					"The format in which the expiration date is stored (e.g. YYYY-MM-DD)"
				)
				.addText((text) =>
					text
						.setPlaceholder("Insert the date format")
						.setValue(this.plugin.settings.expiredDateFormat)
						.onChange(async (value) => {
							this.plugin.settings.expiredDateFormat = value;
							await this.plugin.saveSettings();
						})
				);
		}

		containerEl.createEl("h3", { text: "File exclusions" });

		this.createToggle(
			containerEl,
			"Ignore obsidian excluded files",
			"Does not process files matching the Excluded Files filters in Obsidian Settings",
			"honorObsidianExcludedFiles"
		);



		const exclusionSetting = new Setting(containerEl)
		.setName("Excluded files")
		.setDesc("Excluded files will not be processed")
		.addButton(cb => {
			cb.setButtonText("Manage");
			cb.onClick((evt:MouseEvent)=>{
				new ExcludedFilesModal(this.app, this.plugin.settings,
					async (filters:string[])=>{
						this.plugin.settings.excludedFilesFilters = filters;
						await this.plugin.saveSettings();
						this.display();
					})
					.open();
			})
		});

		if(this.plugin.settings.excludedFilesFilters && this.plugin.settings.excludedFilesFilters.length){
			const ul = exclusionSetting.descEl.createEl("ul");
			this.plugin.settings.excludedFilesFilters.forEach(filter=>{
				ul.createEl("li").setText(filter);
			})
		}



	}

	private createToggle(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		prop: string
	) {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((bool) =>
				bool
					.setValue((this.plugin.settings as any)[prop] as boolean)
					.onChange(async (value) => {
						(this.plugin.settings as any)[prop] = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}
}
