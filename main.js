const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");
const {
    ViewPlugin,
    Decoration,
    WidgetType
} = require("@codemirror/view");


/* =========================================================
 * Defaults
 * ======================================================= */

const DEFAULT_SIGNIFIERS = {
    a: {
        symbol: "→",
        label: "Action",
        enabled: true
    },
    q: {
        symbol: "?",
        label: "Question",
        enabled: true
    },
    d: {
        symbol: "◆",
        label: "Decision",
        enabled: true
    },
    i: {
        symbol: "💡",
        label: "Idea",
        enabled: true
    },
    "!": {
        symbol: "!",
        label: "Critical",
        enabled: true
    },
    w: {
        symbol: "⚠",
        label: "Warning",
        enabled: true
    },
    v: {
        symbol: "✓",
        label: "Verified",
        enabled: true
    },
    u: {
        symbol: "≈",
        label: "Uncertain",
        enabled: true
    },
    t: {
        symbol: "⌁",
        label: "Temporary",
        enabled: true
    },
    r: {
        symbol: "↻",
        label: "Review",
        enabled: true
    }
};


/* =========================================================
 * Settings
 * ======================================================= */

const DEFAULT_SETTINGS = {
    signifiers: DEFAULT_SIGNIFIERS
};


function cloneDefaults() {
    return JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS.signifiers)
    );
}


/* =========================================================
 * Helpers
 * ======================================================= */

function escapeRegex(value) {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}


function getSignifierRegex(signifiers) {
    const keys = Object.keys(signifiers)
        .filter(key => signifiers[key]?.enabled)
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex);

    if (!keys.length) {
        return null;
    }

    return new RegExp(
        `^\\((${keys.join("|")})\\)(?=\\s|$)`
    );
}


function getSignifier(signifiers, key) {
    const definition = signifiers[key];

    if (!definition || !definition.enabled) {
        return null;
    }

    return definition;
}


/* =========================================================
 * Reading View
 * ======================================================= */

function renderReadingView(block, signifiers) {
    if (!block) return;

    // Never render inside code.
    if (block.closest("pre, code")) return;

    // Avoid duplicate rendering.
    if (block.querySelector(":scope > .signifier")) {
        return;
    }

    const regex =
        getSignifierRegex(signifiers);

    if (!regex) return;

    const first = block.firstChild;

    if (!first || first.nodeType !== Node.TEXT_NODE) {
        return;
    }

    const text = first.nodeValue ?? "";
    const match = text.match(regex);

    if (!match) return;

    const key = match[1];
    const definition =
        getSignifier(signifiers, key);

    if (!definition) return;

    const span =
        document.createElement("span");

    span.className =
        `signifier signifier--${key}`;

    span.dataset.signifier = key;

    span.setAttribute(
        "aria-label",
        definition.label
    );

    span.setAttribute(
        "title",
        `${definition.label} (${key})`
    );

    span.textContent =
        definition.symbol;

    const remaining =
        text.slice(match[0].length);

    first.remove();

    block.insertBefore(
        span,
        block.firstChild
    );

    if (remaining) {
        block.insertBefore(
            document.createTextNode(remaining),
            span.nextSibling
        );
    }
}


/* =========================================================
 * Live Preview
 * ======================================================= */

class SignifierWidget extends WidgetType {
    constructor(key, definition) {
        super();

        this.key = key;
        this.definition = definition;
    }

    toDOM() {
        const element =
            document.createElement("span");

        element.className =
            `cm-signifier signifier--${this.key}`;

        element.dataset.signifier =
            this.key;

        element.setAttribute(
            "aria-label",
            this.definition.label
        );

        element.setAttribute(
            "title",
            `${this.definition.label} (${this.key})`
        );

        element.textContent =
            this.definition.symbol;

        return element;
    }

    ignoreEvent() {
        return false;
    }
}


/* =========================================================
 * Fenced Code Detection
 * ======================================================= */

function getFence(line) {
    const match =
        line.match(
            /^\s{0,3}(`{3,}|~{3,})/
        );

    if (!match) {
        return null;
    }

    return {
        character: match[1][0],
        length: match[1].length
    };
}


function isFenceClose(line, fence) {
    if (!fence) return false;

    const pattern =
        new RegExp(
            `^\\s{0,3}${fence.character}{${fence.length},}\\s*$`
        );

    return pattern.test(line);
}


function getCodeRanges(doc) {
    const ranges = [];

    let fence = null;
    let blockStart = null;

    for (
        let lineNo = 1;
        lineNo <= doc.lines;
        lineNo++
    ) {
        const line =
            doc.line(lineNo);

        const text =
            line.text;

        if (!fence) {
            const opening =
                getFence(text);

            if (opening) {
                fence = opening;
                blockStart = line.from;
            }
        } else if (
            isFenceClose(text, fence)
        ) {
            ranges.push({
                from: blockStart,
                to: line.to
            });

            fence = null;
            blockStart = null;
        }
    }

    // Unclosed fenced block.
    if (
        fence &&
        blockStart !== null
    ) {
        ranges.push({
            from: blockStart,
            to: doc.length
        });
    }

    return ranges;
}


function isInsideRange(position, ranges) {
    for (const range of ranges) {
        if (
            position >= range.from &&
            position <= range.to
        ) {
            return true;
        }
    }

    return false;
}


/* =========================================================
 * Live Preview Extension
 * ======================================================= */

function createLivePreviewExtension(plugin) {
    return ViewPlugin.fromClass(
        class {
            constructor(view) {
                this.decorations =
                    this.buildDecorations(view);
            }

            update(update) {
                if (
                    update.docChanged ||
                    update.viewportChanged ||
                    update.selectionSet
                ) {
                    this.decorations =
                        this.buildDecorations(
                            update.view
                        );
                }
            }

            buildDecorations(view) {
                const decorations = [];

                const doc =
                    view.state.doc;

                const signifiers =
                    plugin.settings.signifiers;

                const regex =
                    getSignifierRegex(
                        signifiers
                    );

                if (!regex) {
                    return Decoration.none;
                }

                const codeRanges =
                    getCodeRanges(doc);

                for (
                    const range
                    of view.visibleRanges
                ) {
                    let line =
                        doc.lineAt(range.from);

                    while (
                        line.from <= range.to
                    ) {
                        /*
                         * Fenced code block:
                         * completely ignore this line.
                         */
                        if (
                            isInsideRange(
                                line.from,
                                codeRanges
                            )
                        ) {
                            if (
                                line.to >= range.to ||
                                line.number >= doc.lines
                            ) {
                                break;
                            }

                            line =
                                doc.line(
                                    line.number + 1
                                );

                            continue;
                        }

                        const match =
                            line.text.match(regex);

                        if (match) {
                            const key =
                                match[1];

                            const definition =
                                getSignifier(
                                    signifiers,
                                    key
                                );

                            if (definition) {
                                const from =
                                    line.from;

                                const to =
                                    from +
                                    match[0].length;

                                const selection =
                                    view.state.selection.main;

                                const cursorInside =
                                    selection.from >= from &&
                                    selection.from <= to;

                                if (!cursorInside) {
                                    decorations.push(
                                        Decoration.replace({
                                            widget:
                                                new SignifierWidget(
                                                    key,
                                                    definition
                                                ),
                                            inclusive: false
                                        }).range(
                                            from,
                                            to
                                        )
                                    );
                                }
                            }
                        }

                        if (
                            line.to >= range.to ||
                            line.number >= doc.lines
                        ) {
                            break;
                        }

                        line =
                            doc.line(
                                line.number + 1
                            );
                    }
                }

                return Decoration.set(
                    decorations.sort(
                        (a, b) =>
                            a.from - b.from
                    )
                );
            }
        },
        {
            decorations: value =>
                value.decorations
        }
    );
}


/* =========================================================
 * Settings Tab
 * ======================================================= */

class SignifierSettingTab
    extends PluginSettingTab {

    constructor(app, plugin) {
        super(app, plugin);

        this.plugin = plugin;
    }

    display() {
        const { containerEl } =
            this;

        containerEl.empty();

        containerEl.createEl(
            "h2",
            {
                text: "Signifier"
            }
        );

        containerEl.createEl(
            "p",
            {
                text:
                    "Configure the semantic signifiers used by the plugin."
            }
        );

        const signifiers =
            this.plugin.settings.signifiers;

        for (
            const [key, value]
            of Object.entries(signifiers)
        ) {
            this.renderSignifier(
                containerEl,
                key,
                value
            );
        }

        new Setting(containerEl)
            .addButton(button => {
                button
                    .setButtonText(
                        "Add signifier"
                    )
                    .setCta()
                    .onClick(() => {
                        this.addSignifier();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText(
                        "Restore defaults"
                    )
                    .onClick(async () => {
                        await this.restoreDefaults();
                    });
            });
    }


    renderSignifier(
        containerEl,
        key,
        value
    ) {
        const setting =
            new Setting(containerEl)
                .setName(`(${key})`)
                .setDesc(
                    value.label || "No label"
                );

        setting.addText(text => {
            text
                .setPlaceholder("Symbol")
                .setValue(value.symbol)
                .onChange(async newValue => {
                    value.symbol =
                        newValue;

                    await this.plugin.saveSettings();
                });

            text.inputEl.setCssStyles({
                width: "60px",
                textAlign: "center"
            });
        });

        setting.addText(text => {
            text
                .setPlaceholder("Label")
                .setValue(value.label)
                .onChange(async newValue => {
                    value.label =
                        newValue;

                    setting.setDesc(
                        newValue || "No label"
                    );

                    await this.plugin.saveSettings();
                });
        });

        setting.addToggle(toggle => {
            toggle
                .setValue(
                    value.enabled
                )
                .onChange(async enabled => {
                    value.enabled =
                        enabled;

                    await this.plugin.saveSettings();
                });
        });

        setting.addExtraButton(button => {
            button
                .setIcon("trash")
                .setTooltip(
                    "Delete signifier"
                )
                .onClick(async () => {
                    delete this.plugin
                        .settings
                        .signifiers[key];

                    await this.plugin.saveSettings();

                    this.display();
                });
        });
    }


    async addSignifier() {
        const key =
            await this.requestKey();

        if (!key) return;

        if (
            this.plugin.settings
                .signifiers[key]
        ) {
            new Notice(
                `Signifier (${key}) already exists.`
            );

            return;
        }

        this.plugin.settings
            .signifiers[key] = {
                symbol: "•",
                label: "New signifier",
                enabled: true
            };

        await this.plugin.saveSettings();

        this.display();
    }


    async requestKey() {
        const key =
            window.prompt(
                "Signifier key",
                ""
            );

        if (key === null) {
            return null;
        }

        const trimmed =
            key.trim();

        if (!trimmed) {
            new Notice(
                "Key cannot be empty."
            );

            return null;
        }

        /*
         * Parentheses are reserved by the syntax.
         */
        if (
            trimmed.includes("(") ||
            trimmed.includes(")")
        ) {
            new Notice(
                "Key cannot contain parentheses."
            );

            return null;
        }

        /*
         * Keep the source syntax single-token.
         */
        if (
            /\s/.test(trimmed)
        ) {
            new Notice(
                "Key cannot contain spaces."
            );

            return null;
        }

        return trimmed;
    }


    async restoreDefaults() {
        const confirmed =
            window.confirm(
                "Restore the default signifiers? Custom signifiers will be removed."
            );

        if (!confirmed) {
            return;
        }

        this.plugin.settings.signifiers =
            cloneDefaults();

        await this.plugin.saveSettings();

        this.display();

        new Notice(
            "Default signifiers restored."
        );
    }
}


/* =========================================================
 * Plugin
 * ======================================================= */

module.exports =
    class SignifierPlugin extends Plugin {

        async onload() {
            await this.loadSettings();

            /*
             * Live Preview
             */
            this.registerEditorExtension(
                createLivePreviewExtension(
                    this
                )
            );

            /*
             * Reading View
             */
            this.registerMarkdownPostProcessor(
                element => {
                    const blocks =
                        element.querySelectorAll(
                            "p, li, blockquote, h1, h2, h3, h4, h5, h6"
                        );

                    blocks.forEach(block => {
                        renderReadingView(
                            block,
                            this.settings.signifiers
                        );
                    });
                }
            );

            /*
             * Settings
             */
            this.addSettingTab(
                new SignifierSettingTab(
                    this.app,
                    this
                )
            );
        }


        async loadSettings() {
            const saved =
                await this.loadData();

            this.settings = {
                ...DEFAULT_SETTINGS,
                ...saved,
                signifiers: {
                    ...cloneDefaults(),
                    ...(saved?.signifiers ?? {})
                }
            };
        }


        async saveSettings() {
            await this.saveData(
                this.settings
            );

            /*
             * Force Live Preview to rebuild
             * immediately after a config change.
             */
            this.app.workspace.iterateAllLeaves(
                leaf => {
                    if (
                        leaf.view?.editor
                    ) {
                        leaf.view.editor
                            .dispatch({
                                changes: []
                            });
                    }
                }
            );
        }
    };