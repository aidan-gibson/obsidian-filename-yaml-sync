import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
} from 'obsidian';
import { isExcluded } from './exclusions';

const stockIllegalSymbols = /[\\/:|#^[\]]/g;

interface LinePointer {
  lineNumber: number;
  text: string;
}

interface FilenameHeadingSyncPluginSettings {
  userIllegalSymbols: string[];
  ignoreRegex: string;
  ignoredFiles: { [key: string]: null };
  useFileOpenHook: boolean;
}

const DEFAULT_SETTINGS: FilenameHeadingSyncPluginSettings = {
  userIllegalSymbols: [],
  ignoredFiles: {},
  ignoreRegex: '',
  useFileOpenHook: false,
};

export default class FilenameHeadingSyncPlugin extends Plugin {
  settings: FilenameHeadingSyncPluginSettings;

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) =>
        this.handleSyncFilenameToHeading(file, oldPath),
      ),
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => this.handleSyncHeadingToFile(file)),
    );

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (this.settings.useFileOpenHook) {
          return this.handleSyncFilenameToHeading(file, file.path);
        }
      }),
    );

    this.addSettingTab(new FilenameHeadingSyncSettingTab(this.app, this));

    this.addCommand({
      id: 'page-heading-sync-ignore-file',
      name: 'Ignore current file',
      checkCallback: (checking: boolean) => {
        let leaf = this.app.workspace.activeLeaf;
        if (leaf) {
          if (!checking) {
            this.settings.ignoredFiles[
              this.app.workspace.getActiveFile().path
            ] = null;
            this.saveSettings();
          }
          return true;
        }
        return false;
      },
    });
  }

  fileIsIgnored(activeFile: TFile, path: string): boolean {
    // check exclusions
    if (isExcluded(this.app, activeFile)) {
      return true;
    }

    // check manual ignore
    if (this.settings.ignoredFiles[path] !== undefined) {
      return true;
    }

    // check regex
    try {
      if (this.settings.ignoreRegex === '') {
        return;
      }

      const reg = new RegExp(this.settings.ignoreRegex);
      return reg.exec(path) !== null;
    } catch {}

    return false;
  }

  /**
   * Renames the file with the first heading found
   *
   * @param      {TAbstractFile}  file    The file
   */
  handleSyncHeadingToFile(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
      return;
    }

    if (file.extension !== 'md') {
      // just bail
      return;
    }

    // if currently opened file is not the same as the one that fired the event, skip
    // this is to make sure other events don't trigger this plugin
    if (this.app.workspace.getActiveFile() !== file) {
      return;
    }

    // if ignored, just bail
    if (this.fileIsIgnored(file, file.path)) {
      return;
    }

    this.app.vault.read(file).then((data) => {
      const lines = data.split('\n');
      //const start = this.findNoteStart(lines);
      const heading = this.findHeading(lines);
      //heading = asdf" rn
      if (heading === null) return; // no heading found, nothing to do here
      const headingWithoutLastQuote = heading.text.slice(0,-1);
      //const sanitizedHeading = this.sanitizeHeading(heading.text);
      const sanitizedHeading = this.sanitizeHeading(headingWithoutLastQuote);

      if (
        sanitizedHeading.length > 0 && //if sanitized heading > 0 and
        this.sanitizeHeading(file.basename) !== sanitizedHeading // sanitized heading is diff from current filename
      ) {
        const newPath = `${file.parent.path}/${sanitizedHeading}.md`;
        this.app.fileManager.renameFile(file, newPath);
      }
    });
  }

  /**
   * Syncs the current filename to the first heading
   * Finds the first heading of the file, then replaces it with the filename
   *
   * @param      {TAbstractFile}  file     The file that fired the event
   * @param      {string}         oldPath  The old path
   */
  handleSyncFilenameToHeading(file: TAbstractFile, oldPath: string) {
    if (!(file instanceof TFile)) {
      return;
    }

    if (file.extension !== 'md') {
      // just bail
      return;
    }

    // if oldpath is ignored, hook in and update the new filepath to be ignored instead
    if (this.fileIsIgnored(file, oldPath.trim())) {
      // if filename didn't change, just bail, nothing to do here
      if (file.path === oldPath) {
        return;
      }

      // If filepath changed and the file was in the ignore list before,
      // remove it from the list and add the new one instead
      if (this.settings.ignoredFiles[oldPath]) {
        delete this.settings.ignoredFiles[oldPath];
        this.settings.ignoredFiles[file.path] = null;
        this.saveSettings();
      }
      return;
    }

    const sanitizedHeading = this.sanitizeHeading(file.basename);
    this.app.vault.read(file).then((data) => {
      const lines = data.split('\n');
      //const start = this.findNoteStart(lines);
      const heading = this.findHeading(lines);

      if (heading !== null) {
        if (this.sanitizeHeading(heading.text) !== sanitizedHeading) {
          this.replaceLineInFile(
            file,
            lines,
            heading.lineNumber,
            `title: \"${sanitizedHeading}\"`,
          );
        }
      } //else this.insertLineInFile(file, lines,`title: ${sanitizedHeading}`); // this would insert title: filename on the first line--for now I don't want this extension to do anything if there isn't YAML detected
    });
  }

  // /**
  //  * Finds the start of the note file, excluding frontmatter
  //  *
  //  * @param {string[]} fileLines array of the file's contents, line by line
  //  * @returns {number} zero-based index of the starting line of the note
  //  */
  // findNoteStart(fileLines: string[]) {
  //   // check for frontmatter by checking if first line is a divider ('---')
  //   if (fileLines[0] === '---') {
  //     // find end of frontmatter
  //     // if no end is found, then it isn't really frontmatter and function will end up returning 0
  //     for (let i = 1; i < fileLines.length; i++) {
  //       if (fileLines[i] === '---') {
  //         // end of frontmatter found, next line is start of note
  //         return i + 1;
  //       }
  //     }
  //   }
  //   return 0;
  // }

  /**
   * Finds the first heading of the note file
   *
   * @param {string[]} fileLines array of the file's contents, line by line
   * @returns {LinePointer | null} LinePointer to heading or null if no heading found
   */
  findHeading(fileLines: string[]): LinePointer | null {
    if (fileLines[0] !== '---') {
      return null; // don't bother searching if there isn't even a YAML header on first line
    }
    for (let i = 1; i < fileLines.length; i++) {
      // if (fileLines[i].startsWith('# ')) {
         if (fileLines[i] === '---'){
           return null; //hit end of YAML, stop
         }
         if (fileLines[i].startsWith('title: \"')) {
        return {
          lineNumber: i,
          text: fileLines[i].substring(8), //"title: " is 7 chars, elim those
        };
      }
    }
    return null; // no heading found
  }

  sanitizeHeading(text: string) {
    // stockIllegalSymbols is a regExp object, but userIllegalSymbols is a list of strings and therefore they are handled separately.
    text = text.replace(stockIllegalSymbols, '');
    this.settings.userIllegalSymbols.forEach((symbol) => {
      text = text.replace(symbol, '');
    });
    return text.trim();
  }

  /**
   * Modifies the file by replacing a particular line with new text.
   *
   * The function will add a newline character at the end of the replaced line.
   *
   * If the `lineNumber` parameter is higher than the index of the last line of the file
   * the function will add a newline character to the current last line and append a new
   * line at the end of the file with the new text (essentially a new last line).
   *
   * @param {TFile} file the file to modify
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {number} lineNumber zero-based index of the line to replace
   * @param {string} text the new text
   */
  replaceLineInFile(
    file: TFile,
    fileLines: string[],
    lineNumber: number,
    text: string,
  ) {
    if (lineNumber >= fileLines.length) {
      fileLines.push(text + '\n');
    } else {
      fileLines[lineNumber] = text;
    }
    const data = fileLines.join('\n');
    this.app.vault.modify(file, data);
  }

  /**
   * Modifies the file by inserting a line with specified text.
   *
   * The function will add a newline character at the end of the inserted line.
   *
   * @param {TFile} file the file to modify
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {string} text the text that the line shall contain
   */
  insertLineInFile(
    file: TFile,
    fileLines: string[],
    //lineNumber: number,
    text: string,
  ) {
    // if (lineNumber >= fileLines.length) {
    //   fileLines.push(text + '\n');
    // } else {
    //   fileLines.splice(lineNumber, 0, text);
    // }
    fileLines.splice(0, 0, (text)); //instead i wanna add +'\n'+ text+'\n' to the firstline (intended behavior is, you already have --- at first line. go there, \n (aka press enter for newline), and put in the text, which is title: asdf. join then adds a newline after that(?)
    const data = fileLines.join('\n');
    this.app.vault.modify(file, data);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class FilenameHeadingSyncSettingTab extends PluginSettingTab {
  plugin: FilenameHeadingSyncPlugin;
  app: App;

  constructor(app: App, plugin: FilenameHeadingSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.app = app;
  }

  display(): void {
    let { containerEl } = this;
    let regexIgnoredFilesDiv: HTMLDivElement;

    const renderRegexIgnoredFiles = (div: HTMLElement) => {
      // empty existing div
      div.innerHTML = '';

      if (this.plugin.settings.ignoreRegex === '') {
        return;
      }

      try {
        const files = this.app.vault.getFiles();
        const reg = new RegExp(this.plugin.settings.ignoreRegex);

        files
          .filter((file) => reg.exec(file.path) !== null)
          .forEach((el) => {
            new Setting(div).setDesc(el.path);
          });
      } catch (e) {
        return;
      }
    };

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Filename YAML Sync' });
    containerEl.createEl('p', {
      text:
        'This plugin will keep the filename in sync with the YAML title: and vice versa.',
    });
    containerEl.createEl('p', {
      text:
          ''
        // 'If no header is found, will insert a new one at the first line (after frontmatter).',
    });

    new Setting(containerEl)
      .setName('Custom Illegal Charaters/Strings')
      .setDesc(
        'Type charaters/strings seperated by a comma. This input is space sensitive.',
      )
      .addText((text) =>
        text
          .setPlaceholder('[],#,...')
          .setValue(this.plugin.settings.userIllegalSymbols.join())
          .onChange(async (value) => {
            this.plugin.settings.userIllegalSymbols = value.split(',');
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Ignore Regex Rule')
      .setDesc(
        'Ignore rule in RegEx format. All files listed below will get ignored by this plugin.',
      )
      .addText((text) =>
        text
          .setPlaceholder('MyFolder/.*')
          .setValue(this.plugin.settings.ignoreRegex)
          .onChange(async (value) => {
            try {
              new RegExp(value);
              this.plugin.settings.ignoreRegex = value;
            } catch {
              this.plugin.settings.ignoreRegex = '';
            }

            await this.plugin.saveSettings();
            renderRegexIgnoredFiles(regexIgnoredFilesDiv);
          }),
      );

    new Setting(containerEl)
      .setName('Use File Open Hook')
      .setDesc(
        'Whether this plugin should trigger when a file is opened, and not just on save. Disable this when you notice conflicts with other plugins that also act on file open.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useFileOpenHook)
          .onChange(async (value) => {
            this.plugin.settings.useFileOpenHook = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h2', { text: 'Ignored Files By Regex' });
    containerEl.createEl('p', {
      text: 'All files matching the above RegEx will get listed here',
    });

    regexIgnoredFilesDiv = containerEl.createDiv('test');
    renderRegexIgnoredFiles(regexIgnoredFilesDiv);

    containerEl.createEl('h2', { text: 'Manually Ignored Files' });
    containerEl.createEl('p', {
      text:
        'You can ignore files from this plugin by using the "ignore this file" command',
    });

    // go over all ignored files and add them
    for (let key in this.plugin.settings.ignoredFiles) {
      const ignoredFilesSettingsObj = new Setting(containerEl).setDesc(key);

      ignoredFilesSettingsObj.addButton((button) => {
        button.setButtonText('Delete').onClick(async () => {
          delete this.plugin.settings.ignoredFiles[key];
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }
  }
}
