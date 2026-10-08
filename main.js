const {
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    Modal,
    requestUrl,
    debounce,
    editorLivePreviewField
} = require("obsidian");

const {
    ViewPlugin,
    Decoration,
    WidgetType
} = require("@codemirror/view");

const {
    Compartment
} = require("@codemirror/state");


/* =========================================================
 * Defaults
 * ======================================================= */

const DEFAULT_SIGNIFIERS = {
    a: { symbol: "→", label: "Action", color: "auto", enabled: true },
    q: { symbol: "?", label: "Question", color: "auto", enabled: true },
    d: { symbol: "◆", label: "Decision", color: "auto", enabled: true },
    i: { symbol: "💡", label: "Idea", color: "auto", enabled: true },
    "!": { symbol: "!", label: "Critical", color: "auto", enabled: true },
    w: { symbol: "⚠", label: "Warning", color: "auto", enabled: true },
    v: { symbol: "✓", label: "Verified", color: "auto", enabled: true },
    u: { symbol: "≈", label: "Uncertain", color: "auto", enabled: true },
    t: { symbol: "⌁", label: "Temporary", color: "auto", enabled: true },
    r: { symbol: "↻", label: "Review", color: "auto", enabled: true }
};

const MAX_SVG_LENGTH = 200000;
const ERROR_SYMBOL = "⬚";
const LOADING_SYMBOL = "…";
const SVG_NS = "http://www.w3.org/2000/svg";


/* =========================================================
 * Helpers
 * ======================================================= */

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}


function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_SIGNIFIERS));
}


function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}


function normalizeColor(color) {
    if (typeof color !== "string" || color === "auto") {
        return "auto";
    }

    const value = color.trim();

    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
        return value;
    }

    return "auto";
}


function normalizeEntry(value) {
    const source = isPlainObject(value) ? value : {};

    return {
        symbol: typeof source.symbol === "string" ? source.symbol : "•",
        label: typeof source.label === "string" ? source.label : "No label",
        color: normalizeColor(source.color),
        enabled: source.enabled !== false
    };
}


function isValidKey(key) {
    return (
        typeof key === "string" &&
        key.length > 0 &&
        key !== "__proto__" &&
        !/[()\s]/.test(key)
    );
}


function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/**
 * Returns two regexes:
 *  - reading: matches at the start of a text node
 *  - live:    matches at the start of a source line, allowing
 *             list / task / quote / heading prefixes
 * Both expose the key through the named group "key".
 */
function getSignifierRegexes(signifiers) {
    const keys = Object.keys(signifiers)
        .filter(key => signifiers[key]?.enabled)
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex);

    if (!keys.length) {
        return null;
    }

    const token = `\\((?<key>${keys.join("|")})\\)(?=\\s|$)`;

    return {
        reading: new RegExp(`^(?<lead>\\s*)${token}`),
        live: new RegExp(
            `^(?<prefix>\\s*(?:>\\s*)*(?:(?:[-*+]|\\d+[.)])\\s+(?:\\[[^\\]]\\]\\s+)?|#{1,6}\\s+)?)${token}`
        )
    };
}


function getSignifier(signifiers, key) {
    if (!hasOwn(signifiers, key)) {
        return null;
    }

    const definition = signifiers[key];

    if (!definition || !definition.enabled) {
        return null;
    }

    return definition;
}


/* =========================================================
 * Color
 * ======================================================= */

function applySignifierColor(element, color) {
    const value = normalizeColor(color);

    if (value === "auto") {
        element.style.removeProperty("--signifier-color");
        element.removeAttribute("data-signifier-color");
        return;
    }

    element.dataset.signifierColor = value;
    element.style.setProperty("--signifier-color", value);
}


/* =========================================================
 * SVG (inline + CDN)
 * ======================================================= */

function isSvgSymbol(symbol) {
    return (
        typeof symbol === "string" &&
        /^\s*<svg[\s>]/i.test(symbol)
    );
}


/**
 * "https://..." | "npm:package@1/path.svg" | "gh:user/repo@main/path.svg"
 */
function isUrlSymbol(symbol) {
    return (
        typeof symbol === "string" &&
        /^(https?:\/\/|npm:|gh:)\S+$/i.test(symbol.trim())
    );
}


function resolveSymbolUrl(symbol) {
    const value = symbol.trim();
    let url = value;

    if (/^npm:/i.test(value)) {
        url =
            "https://cdn.jsdelivr.net/npm/" +
            value.slice(4).replace(/^\/+/, "");
    } else if (/^gh:/i.test(value)) {
        url =
            "https://cdn.jsdelivr.net/gh/" +
            value.slice(3).replace(/^\/+/, "");
    }

    try {
        const parsed = new URL(url);

        if (parsed.protocol !== "https:") {
            return null;
        }

        return parsed.href;
    } catch (error) {
        return null;
    }
}


/**
 * Strips XML prolog / doctype / comments in front of <svg>,
 * and makes sure the required namespaces are declared.
 */
function extractSvgMarkup(source) {
    if (typeof source !== "string") {
        return null;
    }

    const index = source.search(/<svg[\s>]/i);

    if (index === -1) {
        return null;
    }

    let markup = source.slice(index);

    const openTag = markup.match(/^<svg[^>]*>/i);

    if (!openTag) {
        return null;
    }

    let patched = openTag[0];

    if (!/\sxmlns\s*=/i.test(patched)) {
        patched = patched.replace(
            /^<svg/i,
            `<svg xmlns="${SVG_NS}"`
        );
    }

    if (
        /\sxlink:/i.test(markup) &&
        !/\sxmlns:xlink\s*=/i.test(patched)
    ) {
        patched = patched.replace(
            /^<svg/i,
            '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
        );
    }

    return patched + markup.slice(openTag[0].length);
}


function createSafeSvg(source) {
    const markup = extractSvgMarkup(source);

    if (!markup) {
        return null;
    }

    const parsed = new DOMParser().parseFromString(
        markup,
        "image/svg+xml"
    );

    const svg = parsed.documentElement;

    if (
        !svg ||
        svg.tagName.toLowerCase() !== "svg" ||
        parsed.querySelector("parsererror")
    ) {
        return null;
    }

    /*
     * Remove executable / embedded / global-scope content.
     * <style> inside inline SVG leaks into the whole document,
     * so it is removed as well.
     */
    svg.querySelectorAll(
        "script, foreignObject, iframe, object, embed, style, set, animate"
    ).forEach(element => element.remove());

    const elements = [svg, ...svg.querySelectorAll("*")];

    for (const element of elements) {
        for (const attribute of Array.from(element.attributes)) {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();

            const isEventHandler = name.startsWith("on");

            /* Only same-document references are allowed. */
            const isExternalHref =
                (name === "href" || name === "xlink:href") &&
                !value.startsWith("#");

            /* url(...) is only allowed when it points to "#id". */
            const isExternalUrl =
                /url\(\s*['"]?\s*(?!#)/i.test(value);

            const isScriptUrl = /javascript:/i.test(value);

            if (
                isEventHandler ||
                isExternalHref ||
                isExternalUrl ||
                isScriptUrl ||
                name === "style"
            ) {
                element.removeAttribute(attribute.name);
            }
        }
    }

    /* Sizing is controlled by CSS; keep the aspect via viewBox. */
    if (!svg.hasAttribute("viewBox")) {
        const width = parseFloat(svg.getAttribute("width"));
        const height = parseFloat(svg.getAttribute("height"));

        if (width > 0 && height > 0) {
            svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        }
    }

    svg.removeAttribute("width");
    svg.removeAttribute("height");

    /* Let icons follow the signifier color by default. */
    if (!svg.hasAttribute("fill")) {
        svg.setAttribute("fill", "currentColor");
    }

    svg.setAttribute("aria-hidden", "true");

    return document.importNode(svg, true);
}


function appendSvg(container, svg) {
    svg.classList.add("signifier-svg");
    container.replaceChildren(svg);
}


function renderSymbol(plugin, container, symbolValue) {
    const symbol = String(symbolValue ?? "").trim();

    container.classList.remove(
        "signifier-loading",
        "signifier-error"
    );

    /* Inline SVG */
    if (isSvgSymbol(symbol)) {
        const svg = createSafeSvg(symbol);

        if (svg) {
            appendSvg(container, svg);
        } else {
            container.classList.add("signifier-error");
            container.textContent = ERROR_SYMBOL;
        }

        return;
    }

    /* CDN / remote SVG */
    if (isUrlSymbol(symbol)) {
        const url = resolveSymbolUrl(symbol);

        if (!url) {
            container.classList.add("signifier-error");
            container.textContent = ERROR_SYMBOL;
            container.setAttribute(
                "title",
                "Invalid or non-HTTPS SVG URL"
            );
            return;
        }

        const cached = plugin.getCachedSvg(url);

        if (cached) {
            appendSvg(container, cached);
            return;
        }

        if (plugin.svgFailed.has(url)) {
            container.classList.add("signifier-error");
            container.textContent = ERROR_SYMBOL;
            return;
        }

        container.classList.add("signifier-loading");
        container.textContent = LOADING_SYMBOL;

        plugin.loadSvg(url).then(() => {
            /*
             * After loading, the SVG is either cached or marked as
             * failed, so this second call can never load again.
             */
            renderSymbol(plugin, container, symbol);
        });

        return;
    }

    /* Plain text / emoji */
    container.textContent = symbol;
}


/* =========================================================
 * Reading View
 * ======================================================= */

function findFirstTextNode(block) {
    for (const node of Array.from(block.childNodes)) {
        /* Task list checkbox. */
        if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.tagName === "INPUT"
        ) {
            continue;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            if (!(node.nodeValue ?? "").trim()) {
                continue;
            }

            return node;
        }

        return null;
    }

    return null;
}


function renderReadingView(plugin, block) {
    if (!block || block.closest("pre, code")) {
        return;
    }

    if (block.querySelector(":scope > .signifier")) {
        return;
    }

    const signifiers = plugin.settings.signifiers;
    const regexes = getSignifierRegexes(signifiers);

    if (!regexes) {
        return;
    }

    const textNode = findFirstTextNode(block);

    if (!textNode) {
        return;
    }

    const text = textNode.nodeValue ?? "";
    const match = text.match(regexes.reading);

    if (!match) {
        return;
    }

    const key = match.groups.key;
    const definition = getSignifier(signifiers, key);

    if (!definition) {
        return;
    }

    const span = document.createElement("span");

    span.className = "signifier";
    span.dataset.signifier = key;
    span.setAttribute("aria-label", definition.label);
    span.setAttribute("title", `${definition.label} (${key})`);

    applySignifierColor(span, definition.color);
    renderSymbol(plugin, span, definition.symbol);

    const lead = match.groups.lead;
    const remaining = text.slice(match[0].length);
    const parent = textNode.parentNode;

    if (lead) {
        parent.insertBefore(document.createTextNode(lead), textNode);
    }

    parent.insertBefore(span, textNode);

    if (remaining) {
        parent.insertBefore(
            document.createTextNode(remaining),
            textNode
        );
    }

    textNode.remove();
}


/* =========================================================
 * Live Preview Widget
 * ======================================================= */

class SignifierWidget extends WidgetType {

    constructor(plugin, key, definition) {
        super();

        this.plugin = plugin;
        this.key = key;

        /*
         * Snapshot the values. The settings object is mutated in
         * place, so comparing against it later would always say
         * "equal" and leave stale DOM on screen.
         */
        this.symbol = definition.symbol;
        this.label = definition.label;
        this.color = normalizeColor(definition.color);
    }


    eq(other) {
        return (
            other instanceof SignifierWidget &&
            other.key === this.key &&
            other.symbol === this.symbol &&
            other.label === this.label &&
            other.color === this.color
        );
    }


    toDOM() {
        const element = document.createElement("span");

        element.className = "cm-signifier";
        element.dataset.signifier = this.key;
        element.setAttribute("aria-label", this.label);
        element.setAttribute("title", `${this.label} (${this.key})`);

        applySignifierColor(element, this.color);
        renderSymbol(this.plugin, element, this.symbol);

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
    /*
     * Backtick fences may not contain backticks in the info
     * string (otherwise it is inline code like ```x```).
     */
    const match = line.match(/^\s*(?:(`{3,})[^`]*|(~{3,}).*)$/);

    if (!match) {
        return null;
    }

    const marker = match[1] || match[2];

    return {
        character: marker[0],
        length: marker.length
    };
}


function isFenceClose(line, fence) {
    if (!fence) {
        return false;
    }

    return new RegExp(
        `^\\s*${fence.character}{${fence.length},}\\s*$`
    ).test(line);
}


function getCodeRanges(doc) {
    const ranges = [];

    let fence = null;
    let blockStart = null;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);

        if (!fence) {
            const opening = getFence(line.text);

            if (opening) {
                fence = opening;
                blockStart = line.from;
            }
        } else if (isFenceClose(line.text, fence)) {
            ranges.push({ from: blockStart, to: line.to });

            fence = null;
            blockStart = null;
        }
    }

    if (fence && blockStart !== null) {
        ranges.push({ from: blockStart, to: doc.length });
    }

    return ranges;
}


function isInsideRange(position, ranges) {
    for (const range of ranges) {
        if (position >= range.from && position <= range.to) {
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
                this.decorations = this.buildDecorations(view);
            }


            update(update) {
                const modeChanged =
                    update.state.field(editorLivePreviewField, false) !==
                    update.startState.field(editorLivePreviewField, false);

                if (
                    update.docChanged ||
                    update.viewportChanged ||
                    update.selectionSet ||
                    modeChanged
                ) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }


            buildDecorations(view) {
                /* Source mode must show the raw text. */
                if (!view.state.field(editorLivePreviewField, false)) {
                    return Decoration.none;
                }

                const signifiers = plugin.settings.signifiers;
                const regexes = getSignifierRegexes(signifiers);

                if (!regexes) {
                    return Decoration.none;
                }

                const doc = view.state.doc;
                const codeRanges = getCodeRanges(doc);
                const selections = view.state.selection.ranges;
                const decorations = [];

                let lastLine = 0;

                for (const range of view.visibleRanges) {
                    const first = Math.max(
                        doc.lineAt(range.from).number,
                        lastLine + 1
                    );

                    const last = doc.lineAt(range.to).number;

                    for (let number = first; number <= last; number++) {
                        lastLine = number;

                        const line = doc.line(number);

                        if (isInsideRange(line.from, codeRanges)) {
                            continue;
                        }

                        const match = line.text.match(regexes.live);

                        if (!match) {
                            continue;
                        }

                        const key = match.groups.key;
                        const definition = getSignifier(signifiers, key);

                        if (!definition) {
                            continue;
                        }

                        const prefixLength = match.groups.prefix.length;
                        const from = line.from + prefixLength;
                        const to = line.from + match[0].length;

                        const touched = selections.some(
                            selection =>
                                selection.from <= to &&
                                selection.to >= from
                        );

                        if (touched) {
                            continue;
                        }

                        decorations.push(
                            Decoration.replace({
                                widget: new SignifierWidget(
                                    plugin,
                                    key,
                                    definition
                                ),
                                inclusive: false
                            }).range(from, to)
                        );
                    }
                }

                return Decoration.set(decorations, true);
            }
        },
        {
            decorations: value => value.decorations
        }
    );
}


/* =========================================================
 * Add Signifier Modal
 * ======================================================= */

class AddSignifierModal extends Modal {

    constructor(app, plugin, onSubmit) {
        super(app);

        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.key = "";
    }


    onOpen() {
        const { contentEl } = this;

        contentEl.empty();

        contentEl.createEl("h2", { text: "Add signifier" });

        contentEl.createEl("p", {
            text: "Enter the key used inside parentheses."
        });

        new Setting(contentEl)
            .setName("Key")
            .setDesc("Example: (n)")
            .addText(text => {
                text
                    .setPlaceholder("n")
                    .onChange(value => {
                        this.key = value;
                    });

                text.inputEl.addEventListener("keydown", event => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        this.submit();
                    }
                });

                setTimeout(() => text.inputEl.focus(), 0);
            });

        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText("Cancel")
                    .onClick(() => this.close());
            })
            .addButton(button => {
                button
                    .setButtonText("Add")
                    .setCta()
                    .onClick(() => this.submit());
            });
    }


    submit() {
        const key = this.key.trim();

        if (!key) {
            new Notice("Key cannot be empty.");
            return;
        }

        if (key.includes("(") || key.includes(")")) {
            new Notice("Key cannot contain parentheses.");
            return;
        }

        if (/\s/.test(key)) {
            new Notice("Key cannot contain spaces.");
            return;
        }

        if (!isValidKey(key)) {
            new Notice("This key is not allowed.");
            return;
        }

        if (hasOwn(this.plugin.settings.signifiers, key)) {
            new Notice(`Signifier (${key}) already exists.`);
            return;
        }

        this.onSubmit(key);
        this.close();
    }


    onClose() {
        this.contentEl.empty();
    }
}


/* =========================================================
 * Confirm Modal
 * ======================================================= */

class ConfirmModal extends Modal {

    constructor(app, message, onResult) {
        super(app);

        this.message = message;
        this.onResult = onResult;
        this.result = false;
    }


    onOpen() {
        const { contentEl } = this;

        contentEl.empty();

        contentEl.createEl("p", { text: this.message });

        new Setting(contentEl)
            .addButton(button => {
                button
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.result = false;
                        this.close();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText("Restore defaults")
                    .setWarning()
                    .onClick(() => {
                        this.result = true;
                        this.close();
                    });
            });
    }


    onClose() {
        this.contentEl.empty();
        this.onResult(this.result);
    }
}


/* =========================================================
 * Settings Tab
 * ======================================================= */

class SignifierSettingTab extends PluginSettingTab {

    constructor(app, plugin) {
        super(app, plugin);

        this.plugin = plugin;
    }


    display() {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Signifier")
            .setHeading();

        containerEl.createEl("p", {
            text: "Configure the semantic signifiers used by the plugin."
        });

        const help = containerEl.createEl("p", {
            cls: "setting-item-description"
        });

        help.setText(
            "Symbol can be plain text / emoji, an inline <svg>…</svg>, " +
            "an https:// SVG URL, or a CDN shorthand: " +
            "npm:lucide-static@latest/icons/check.svg  or  " +
            "gh:user/repo@main/icon.svg (both resolved via jsDelivr). " +
            "Remote SVGs are sanitized and cached for offline use."
        );

        Object.entries(this.plugin.settings.signifiers).forEach(
            ([key, value]) => this.renderSignifier(containerEl, key, value)
        );

        new Setting(containerEl)
            .addButton(button => {
                button
                    .setButtonText("Add signifier")
                    .setCta()
                    .onClick(() => {
                        new AddSignifierModal(
                            this.app,
                            this.plugin,
                            async key => {
                                this.plugin.settings.signifiers[key] = {
                                    symbol: "•",
                                    label: "New signifier",
                                    color: "auto",
                                    enabled: true
                                };

                                await this.plugin.saveSettings();

                                this.display();
                            }
                        ).open();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText("Clear SVG cache")
                    .onClick(async () => {
                        await this.plugin.clearSvgCache();

                        new Notice("SVG cache cleared.");
                    });
            })
            .addButton(button => {
                button
                    .setButtonText("Restore defaults")
                    .onClick(() => this.restoreDefaults());
            });
    }


    renderSignifier(containerEl, key, value) {
        const setting = new Setting(containerEl)
            .setName(`(${key})`)
            .setDesc(value.label || "No label");

        /* Symbol / SVG / URL */
        setting.addText(text => {
            text
                .setPlaceholder("Symbol, SVG or URL")
                .setValue(value.symbol)
                .onChange(newValue => {
                    value.symbol = newValue;
                    this.plugin.requestSave();
                });

            text.inputEl.style.width = "160px";
        });

        /* Label */
        setting.addText(text => {
            text
                .setPlaceholder("Label")
                .setValue(value.label)
                .onChange(newValue => {
                    value.label = newValue;
                    setting.setDesc(newValue || "No label");
                    this.plugin.requestSave();
                });
        });

        /* Color */
        setting.addColorPicker(picker => {
            const current = normalizeColor(value.color);

            picker.setValue(current === "auto" ? "#808080" : current);
            /* ColorComponent has no setTooltip(). */
            if (picker.colorPickerEl) {
                picker.colorPickerEl.setAttribute(
                    "title",
                    "Signifier color"
                );
            }

            picker.onChange(newValue => {
                value.color = newValue;
                this.plugin.requestSave();
            });
        });

        /* Reset color to theme */
        setting.addExtraButton(button => {
            button
                .setIcon("rotate-ccw")
                .setTooltip("Use theme color")
                .onClick(async () => {
                    value.color = "auto";

                    await this.plugin.saveSettings();

                    this.display();
                });
        });

        /* Enabled */
        setting.addToggle(toggle => {
            toggle
                .setValue(value.enabled)
                .setTooltip("Enable signifier")
                .onChange(async enabled => {
                    value.enabled = enabled;

                    await this.plugin.saveSettings();
                });
        });

        /* Delete */
        setting.addExtraButton(button => {
            button
                .setIcon("trash")
                .setTooltip("Delete signifier")
                .onClick(async () => {
                    delete this.plugin.settings.signifiers[key];

                    await this.plugin.saveSettings();

                    this.display();
                });
        });
    }


    async restoreDefaults() {
        const confirmed = await this.plugin.confirmRestoreDefaults();

        if (!confirmed) {
            return;
        }

        this.plugin.settings.signifiers = cloneDefaults();

        await this.plugin.saveSettings();

        this.display();

        new Notice("Default signifiers restored.");
    }
}


/* =========================================================
 * Plugin
 * ======================================================= */

module.exports = class SignifierPlugin extends Plugin {

    async onload() {
        this.svgNodes = new Map();
        this.svgPending = new Map();
        this.svgFailed = new Set();

        await this.loadSettings();

        this.requestSave = debounce(
            () => this.saveSettings(),
            500,
            true
        );

        this.requestPersist = debounce(
            () => this.saveData(this.settings),
            500,
            true
        );

        /*
         * CodeMirror compartment: lets us reconfigure the Live
         * Preview extension without touching Obsidian's Editor
         * wrapper.
         */
        this.livePreviewCompartment = new Compartment();

        this.registerEditorExtension(
            this.livePreviewCompartment.of(
                createLivePreviewExtension(this)
            )
        );

        /* Reading View */
        this.registerMarkdownPostProcessor(element => {
            element
                .querySelectorAll(
                    "p, li, blockquote, h1, h2, h3, h4, h5, h6"
                )
                .forEach(block => renderReadingView(this, block));
        });

        this.addSettingTab(new SignifierSettingTab(this.app, this));
    }


    /* ----------------------------- settings ---------------- */

    async loadSettings() {
        const saved = await this.loadData();

        let signifiers;

        if (saved && isPlainObject(saved.signifiers)) {
            /*
             * Use ONLY what the user saved. Merging defaults here
             * would resurrect signifiers the user deleted.
             */
            signifiers = {};

            for (const [key, value] of Object.entries(saved.signifiers)) {
                if (isValidKey(key) && isPlainObject(value)) {
                    signifiers[key] = normalizeEntry(value);
                }
            }
        } else {
            signifiers = cloneDefaults();
        }

        const svgCache = {};

        if (saved && isPlainObject(saved.svgCache)) {
            for (const [url, svg] of Object.entries(saved.svgCache)) {
                if (typeof svg === "string" && /^https:\/\//i.test(url)) {
                    svgCache[url] = svg;
                }
            }
        }

        this.settings = { signifiers, svgCache };
    }


    async saveSettings() {
        await this.saveData(this.settings);

        /* Give edited / fixed URLs another chance. */
        this.svgFailed.clear();

        this.refreshViews();
    }


    refreshViews() {
        this.app.workspace.iterateAllLeaves(leaf => {
            const view = leaf.view;

            try {
                const cm = view?.editor?.cm;

                if (cm && typeof cm.dispatch === "function") {
                    cm.dispatch({
                        effects: this.livePreviewCompartment.reconfigure(
                            createLivePreviewExtension(this)
                        )
                    });
                }
            } catch (error) {
                console.warn("[Signifier] Editor refresh failed", error);
            }

            /* Reading View does not refresh by itself. */
            try {
                view?.previewMode?.rerender?.(true);
            } catch (error) {
                console.warn("[Signifier] Preview refresh failed", error);
            }
        });
    }


    /* ----------------------------- SVG cache --------------- */

    getCachedSvg(url) {
        let node = this.svgNodes.get(url);

        if (!node) {
            const stored = this.settings.svgCache[url];

            if (stored) {
                node = createSafeSvg(stored);

                if (node) {
                    this.svgNodes.set(url, node);
                }
            }
        }

        return node ? node.cloneNode(true) : null;
    }


    loadSvg(url) {
        if (this.svgPending.has(url)) {
            return this.svgPending.get(url);
        }

        const promise = (async () => {
            try {
                const response = await requestUrl({
                    url,
                    method: "GET"
                });

                const text = response.text;

                if (
                    typeof text !== "string" ||
                    text.length > MAX_SVG_LENGTH
                ) {
                    throw new Error("Invalid or too large response");
                }

                const svg = createSafeSvg(text);

                if (!svg) {
                    throw new Error("Response is not a valid SVG");
                }

                this.svgNodes.set(url, svg);

                this.settings.svgCache[url] =
                    new XMLSerializer().serializeToString(svg);

                this.requestPersist();

                return true;
            } catch (error) {
                console.warn(
                    `[Signifier] Could not load SVG from ${url}`,
                    error
                );

                this.svgFailed.add(url);

                return false;
            } finally {
                this.svgPending.delete(url);
            }
        })();

        this.svgPending.set(url, promise);

        return promise;
    }


    async clearSvgCache() {
        this.settings.svgCache = {};

        this.svgNodes.clear();
        this.svgFailed.clear();

        await this.saveSettings();
    }


    /* ----------------------------- misc -------------------- */

    confirmRestoreDefaults() {
        return new Promise(resolve => {
            new ConfirmModal(
                this.app,
                "Restore the default signifiers? Custom signifiers will be removed.",
                resolve
            ).open();
        });
    }
};