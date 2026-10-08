const {
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    Modal,
    requestUrl,
    debounce,
    editorLivePreviewField,
    DropdownComponent,
    TextComponent,
    ColorComponent,
    Platform,
    apiVersion
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
    "s": {
        "symbol": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12.0006 18.26L4.94715 22.2082L6.52248 14.2799L0.587891 8.7918L8.61493 7.84006L12.0006 0.5L15.3862 7.84006L23.4132 8.7918L17.4787 14.2799L19.054 22.2082L12.0006 18.26Z\"></path></svg>",
        "label": "Important",
        "colorMode": "auto",
        "color": "auto",
        "enabled": true
    },
    "!": {
        "symbol": "data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath d='M2 0h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2Zm6 3a1.5 1.5 0 0 0-1.5 1.75l.75 4.5a.75.75 0 0 0 1.5 0l.75-4.5A1.5 1.5 0 0 0 8 3Zm0 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z' fill='black'/%3e%3c/svg%3e",
        "label": "Critical",
        "colorMode": "theme",
        "color": "var(--color-red)",
        "enabled": true
    },
    "i": {
        "symbol": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M7.94101 18C7.64391 16.7274 6.30412 15.6857 5.75395 14.9992C4.65645 13.6297 4 11.8915 4 10C4 5.58172 7.58172 2 12 2C16.4183 2 20 5.58172 20 10C20 11.8925 19.3428 13.6315 18.2443 15.0014C17.6944 15.687 16.3558 16.7276 16.059 18H7.94101ZM16 20V21C16 22.1046 15.1046 23 14 23H10C8.89543 23 8 22.1046 8 21V20H16ZM13 10.0048V6L8.5 12.0048H11V16.0048L15.5 10.0048H13Z\"></path></svg>",
        "label": "Inspiration",
        "colorMode": "theme",
        "color": "var(--color-orange)",
        "enabled": true
    },
    "?": {
        "symbol": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"36\" height=\"36\" fill=\"currentColor\"><path d=\"M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 15V17H13V15H11ZM13 13.3551C14.4457 12.9248 15.5 11.5855 15.5 10C15.5 8.067 13.933 6.5 12 6.5C10.302 6.5 8.88637 7.70919 8.56731 9.31346L10.5288 9.70577C10.6656 9.01823 11.2723 8.5 12 8.5C12.8284 8.5 13.5 9.17157 13.5 10C13.5 10.8284 12.8284 11.5 12 11.5C11.4477 11.5 11 11.9477 11 12.5V14H13V13.3551Z\"></path></svg>",
        "label": "Question",
        "colorMode": "theme",
        "color": "var(--color-green)",
        "enabled": true
    },
    "d": {
        "symbol": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12.0001 22.0001C7.02956 22.0001 3.00012 17.9707 3.00012 13.0001C3.00012 8.02956 7.02956 4.00012 12.0001 4.00012C16.9707 4.00012 21.0001 8.02956 21.0001 13.0001C21.0001 17.9707 16.9707 22.0001 12.0001 22.0001ZM13.0001 13.0001V8.00012H11.0001V15.0001H16.0001V13.0001H13.0001ZM1.74707 6.2826L5.2826 2.74707L6.69682 4.16128L3.16128 7.69682L1.74707 6.2826ZM18.7176 2.74707L22.2532 6.2826L20.839 7.69682L17.3034 4.16128L18.7176 2.74707Z\"></path></svg>",
        "label": "Due",
        "colorMode": "theme",
        "color": "var(--color-purple)",
        "enabled": true
    }
};


const COLOR_MODES = ["auto", "theme", "free", "fixed"];

const THEME_COLOR_VARS = [
    "--text-normal",
    "--text-muted",
    "--text-faint",
    "--text-accent",
    "--text-error",
    "--text-warning",
    "--text-success",
    "--interactive-accent",
    "--color-red",
    "--color-orange",
    "--color-yellow",
    "--color-green",
    "--color-cyan",
    "--color-blue",
    "--color-purple",
    "--color-pink"
];

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
    const clone = JSON.parse(JSON.stringify(DEFAULT_SIGNIFIERS));

    for (const key of Object.keys(clone)) {
        clone[key] = normalizeEntry(clone[key]);
    }

    return clone;
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

    if (isHexColor(value) || isVarColor(value)) {
        return value;
    }

    return "auto";
}


function isHexColor(value) {
    return (
        typeof value === "string" &&
        /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
    );
}


/* Only "var(--name)" is accepted, never free CSS. */
function isVarColor(value) {
    return (
        typeof value === "string" &&
        /^var\(--[A-Za-z0-9_-]+\)$/.test(value)
    );
}


function getVarName(color) {
    return isVarColor(color) ? color.slice(4, -1) : "";
}


/* Accepts "--x", "x" or "var(--x)". Returns "var(--x)" or null. */
function parseVarInput(input) {
    let name = String(input)
        .trim()
        .replace(/^var\(\s*/i, "")
        .replace(/\s*\)$/, "");

    if (!name.startsWith("--")) {
        name = "--" + name;
    }

    return /^--[A-Za-z0-9_-]+$/.test(name) ? `var(${name})` : null;
}


/* <input type="color"> only understands #rrggbb. */
function toPickerHex(color) {
    if (!isHexColor(color)) {
        return "#808080";
    }

    if (color.length === 4) {
        return (
            "#" +
            color[1] + color[1] +
            color[2] + color[2] +
            color[3] + color[3]
        );
    }

    return color.slice(0, 7);
}


/* Value to use after switching to a mode (keeps it if it fits). */
function defaultColorForMode(mode, current) {
    switch (mode) {
        case "theme":
            return THEME_COLOR_VARS.includes(getVarName(current))
                ? current
                : "var(--text-accent)";

        case "free":
            return isVarColor(current) ? current : "auto";

        case "fixed":
            return isHexColor(current) ? current : "#808080";

        default:
            return "auto";
    }
}


function normalizeEntry(value) {
    const source = isPlainObject(value) ? value : {};
    const color = normalizeColor(source.color);

    let mode = source.colorMode;

    /* Old settings had no colorMode: derive it from the color. */
    if (!COLOR_MODES.includes(mode)) {
        if (isHexColor(color)) {
            mode = "fixed";
        } else if (isVarColor(color)) {
            mode = THEME_COLOR_VARS.includes(getVarName(color))
                ? "theme"
                : "free";
        } else {
            mode = "auto";
        }
    }

    return {
        symbol: typeof source.symbol === "string" ? source.symbol : "•",
        label: typeof source.label === "string" ? source.label : "No label",
        colorMode: mode,
        color: defaultColorForMode(mode, color),
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


/* Returns an error message, or null when the key is usable. */
function getKeyError(signifiers, key, currentKey = null) {
    if (!key) {
        return "Key cannot be empty.";
    }

    if (key.includes("(") || key.includes(")")) {
        return "Key cannot contain parentheses.";
    }

    if (/\s/.test(key)) {
        return "Key cannot contain spaces.";
    }

    if (!isValidKey(key)) {
        return "This key is not allowed.";
    }

    if (key !== currentKey && hasOwn(signifiers, key)) {
        return `Signifier (${key}) already exists.`;
    }

    return null;
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

    /* Theme variables fall back to the accent color if undefined. */
    const css = isVarColor(value)
        ? value.replace(/\)$/, ", var(--text-accent))")
        : value;

    element.style.setProperty("--signifier-color", css);
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


function appendMask(container, dataUri) {
    /* Quotes / line breaks would break out of url("..."). */
    const safeUri = String(dataUri)
        .replace(/[\r\n]+/g, "")
        .replace(/"/g, "%22");

    container.textContent = "";
    container.classList.add("signifier-mask");

    const style = container.style;

    style.setProperty("-webkit-mask-image", `url("${safeUri}")`);
    style.setProperty("mask-image", `url("${safeUri}")`);
    style.setProperty("-webkit-mask-repeat", "no-repeat");
    style.setProperty("mask-repeat", "no-repeat");
    style.setProperty("-webkit-mask-position", "center");
    style.setProperty("mask-position", "center");
    style.setProperty("-webkit-mask-size", "contain");
    style.setProperty("mask-size", "contain");
    style.setProperty(
        "background-color",
        "var(--signifier-color, currentColor)"
    );

    /* A mask element must have a size. */
    if (!style.width) {
        style.width = "1em";
    }

    if (!style.height) {
        style.height = "1em";
    }

    if (!style.display) {
        style.display = "inline-block";
    }
}


function svgToDataUri(svg) {
    const serialized = new XMLSerializer().serializeToString(svg);

    return (
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(serialized)
    );
}


function resetMask(container) {
    container.classList.remove(
        "signifier-loading",
        "signifier-error",
        "signifier-mask"
    );

    [
        "-webkit-mask-image",
        "mask-image",
        "-webkit-mask-repeat",
        "mask-repeat",
        "-webkit-mask-position",
        "mask-position",
        "-webkit-mask-size",
        "mask-size",
        "background-color",
        "width",
        "height",
        "display"
    ].forEach(property => container.style.removeProperty(property));
}


function renderSymbol(plugin, container, symbolValue) {
    const symbol = String(symbolValue ?? "").trim();

    resetMask(container);

    /* SVG data URI */
    if (/^data:image\/svg\+xml[,;]/i.test(symbol)) {
        appendMask(container, symbol);
        return;
    }

    /* Inline SVG */
    if (isSvgSymbol(symbol)) {
        const svg = createSafeSvg(symbol);

        if (svg) {
            appendMask(container, svgToDataUri(svg));
        } else {
            plugin.log("Inline SVG rejected (parse error or no <svg>)");

            container.classList.add("signifier-error");
            container.textContent = ERROR_SYMBOL;
        }

        return;
    }

    /* Remote / CDN SVG */
    if (isUrlSymbol(symbol)) {
        const url = resolveSymbolUrl(symbol);

        if (!url) {
            plugin.log("Invalid or non-HTTPS SVG URL", symbol);

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
            appendMask(container, svgToDataUri(cached));
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
            /* Now cached or failed, so this cannot load again. */
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

                const started = performance.now();

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

                if (plugin.settings.debug) {
                    plugin.log(
                        `Live Preview: ${decorations.length} widget(s) in ` +
                        `${(performance.now() - started).toFixed(1)} ms`
                    );
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
        const error = getKeyError(this.plugin.settings.signifiers, key);

        if (error) {
            new Notice(error);
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
            "an SVG data URI, an https:// SVG URL, or a CDN shorthand: " +
            "npm:lucide-static@latest/icons/check.svg or " +
            "gh:user/repo@main/icon.svg (both resolved via jsDelivr). " +
            "SVG sources are rendered as CSS masks, sanitized, and cached for offline use."
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
                                    colorMode: "auto",
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

        /* ---------- Debug ---------- */
        new Setting(containerEl)
            .setName("Debug")
            .setHeading();

        new Setting(containerEl)
            .setName("Debug logging")
            .setDesc(
                "Writes details to the developer console " +
                "(Ctrl/Cmd+Shift+I). Off by default."
            )
            .addToggle(toggle => {
                toggle
                    .setValue(Boolean(this.plugin.settings.debug))
                    .onChange(async enabled => {
                        this.plugin.settings.debug = enabled;

                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Debug info")
            .setDesc(
                "Copies the plugin / Obsidian version, signifier summary " +
                "and SVG cache state. Useful for bug reports."
            )
            .addButton(button => {
                button
                    .setButtonText("Copy debug info")
                    .onClick(() => this.plugin.copyDebugInfo());
            });
    }


    renderSignifier(containerEl, key, value) {
        const block = containerEl.createDiv({ cls: "signifier-block" });

        const subRow = name => {
            const row = new Setting(block).setName(name);

            row.settingEl.classList.add("signifier-subrow");

            return row;
        };

        /* Set later by the Shortcut row. */
        let shortcutInput = null;

        /* ---------- Header: (key), edit, enable toggle, delete ---------- */
        const header = new Setting(block)
            .setName(`(${key})`)
            .setDesc(value.label || "No label");

        header.settingEl.classList.add("signifier-header");

        header.addExtraButton(button => {
            button
                .setIcon("pencil")
                .setTooltip("Edit shortcut")
                .onClick(() => {
                    shortcutInput?.focus();
                    shortcutInput?.select();
                });
        });

        header.addToggle(toggle => {
            toggle
                .setValue(value.enabled)
                .setTooltip("Enable signifier")
                .onChange(async enabled => {
                    value.enabled = enabled;

                    await this.plugin.saveSettings();
                });
        });

        header.addExtraButton(button => {
            button
                .setIcon("trash")
                .setTooltip("Delete signifier")
                .onClick(async () => {
                    delete this.plugin.settings.signifiers[key];

                    await this.plugin.saveSettings();

                    this.display();
                });
        });

        /* ---------- Shortcut (editable key) ---------- */
        let renaming = false;

        const commitShortcut = async () => {
            if (renaming || !shortcutInput) {
                return;
            }

            const candidate = shortcutInput.value.trim();

            if (candidate === key) {
                shortcutInput.value = key;
                shortcutInput.classList.remove("signifier-input-invalid");
                return;
            }

            const error = getKeyError(
                this.plugin.settings.signifiers,
                candidate,
                key
            );

            if (error) {
                shortcutInput.classList.add("signifier-input-invalid");
                new Notice(error);
                return;
            }

            renaming = true;

            await this.renameKey(key, candidate);
        };

        const shortcutRow = subRow("Shortcut").setDesc(
            "The text typed between the parentheses, e.g. s for (s). " +
            "Apply with Enter or the check button."
        );

        shortcutRow.addText(text => {
            const input = text.inputEl;

            shortcutInput = input;

            text.setPlaceholder("key").setValue(key);

            input.style.width = "90px";

            input.addEventListener("input", () => {
                const candidate = input.value.trim();

                const error =
                    candidate === key
                        ? null
                        : getKeyError(
                            this.plugin.settings.signifiers,
                            candidate,
                            key
                        );

                input.classList.toggle(
                    "signifier-input-invalid",
                    Boolean(error)
                );
            });

            input.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    commitShortcut();
                }
            });

            /* Fires when the field loses focus after an edit. */
            input.addEventListener("change", () => commitShortcut());
        });

        shortcutRow.addExtraButton(button => {
            button
                .setIcon("check")
                .setTooltip("Apply shortcut")
                .onClick(() => commitShortcut());
        });

        /* ---------- Symbol ---------- */
        subRow("Symbol")
            .setDesc("Text, emoji, <svg>, SVG data URI or SVG URL.")
            .addTextArea(area => {
                area
                    .setPlaceholder("Symbol, SVG or URL")
                    .setValue(value.symbol)
                    .onChange(newValue => {
                        value.symbol = newValue;
                        this.plugin.requestSave();
                    });

                area.inputEl.rows = 2;
                area.inputEl.style.width = "280px";
            });

        /* ---------- Label ---------- */
        subRow("Label").addText(text => {
            text
                .setPlaceholder("Label")
                .setValue(value.label)
                .onChange(newValue => {
                    value.label = newValue;
                    header.setDesc(newValue || "No label");
                    this.plugin.requestSave();
                });
        });

        /* ---------- Color: mode dropdown + mode specific control ---------- */
        const colorRow = subRow("Color").setDesc(
            "Auto follows the theme."
        );

        const colorHolder = colorRow.controlEl.createSpan({
            cls: "signifier-color-control"
        });

        const modeDropdown = new DropdownComponent(colorHolder);

        const valueHolder = colorHolder.createSpan({
            cls: "signifier-color-value"
        });

        const renderColorValue = () => {
            valueHolder.replaceChildren();

            if (value.colorMode === "theme") {
                const dropdown = new DropdownComponent(valueHolder);

                THEME_COLOR_VARS.forEach(name =>
                    dropdown.addOption(name, name)
                );

                dropdown
                    .setValue(getVarName(value.color))
                    .onChange(name => {
                        value.color = `var(${name})`;
                        this.plugin.requestSave();
                    });

                return;
            }

            if (value.colorMode === "free") {
                const text = new TextComponent(valueHolder);

                text
                    .setPlaceholder("--my-variable")
                    .setValue(getVarName(value.color))
                    .onChange(input => {
                        if (!input.trim()) {
                            text.inputEl.classList.remove(
                                "signifier-input-invalid"
                            );

                            value.color = "auto";
                            this.plugin.requestSave();

                            return;
                        }

                        const parsed = parseVarInput(input);

                        text.inputEl.classList.toggle(
                            "signifier-input-invalid",
                            !parsed
                        );

                        if (!parsed) {
                            return;
                        }

                        value.color = parsed;
                        this.plugin.requestSave();
                    });

                text.inputEl.setAttribute(
                    "title",
                    "CSS variable, e.g. --color-pink"
                );

                text.inputEl.style.width = "140px";

                return;
            }

            if (value.colorMode === "fixed") {
                const picker = new ColorComponent(valueHolder);

                picker.setValue(toPickerHex(value.color));

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
            }
        };

        modeDropdown
            .addOptions({
                auto: "Auto",
                theme: "Theme",
                free: "Free",
                fixed: "Fixed"
            })
            .setValue(value.colorMode)
            .onChange(async mode => {
                value.colorMode = mode;
                value.color = defaultColorForMode(mode, value.color);

                renderColorValue();

                await this.plugin.saveSettings();
            });

        renderColorValue();
    }


    /* Renames a key while keeping the list order. */
    async renameKey(oldKey, newKey) {
        this.plugin.log(`Renaming (${oldKey}) -> (${newKey})`);

        const signifiers = this.plugin.settings.signifiers;

        this.plugin.settings.signifiers = Object.fromEntries(
            Object.entries(signifiers).map(([key, value]) => [
                key === oldKey ? newKey : key,
                value
            ])
        );

        await this.plugin.saveSettings();

        this.display();
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

        this.addCommand({
            id: "copy-debug-info",
            name: "Copy debug info",
            callback: () => this.copyDebugInfo()
        });

        this.addCommand({
            id: "toggle-debug",
            name: "Toggle debug logging",
            callback: async () => {
                this.settings.debug = !this.settings.debug;

                await this.saveSettings();

                new Notice(
                    `Signifier debug logging ${
                        this.settings.debug ? "enabled" : "disabled"
                    }.`
                );
            }
        });

        this.log("Plugin loaded", this.manifest?.version);
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

        this.settings = {
            signifiers,
            svgCache,
            debug: Boolean(saved && saved.debug === true)
        };

        this.log("Settings loaded", {
            signifiers: Object.keys(signifiers).length,
            cachedSvgs: Object.keys(svgCache).length
        });
    }


    async saveSettings() {
        await this.saveData(this.settings);

        this.log("Settings saved, refreshing views");

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
                this.warn("Editor refresh failed", error);
            }

            /* Reading View does not refresh by itself. */
            try {
                view?.previewMode?.rerender?.(true);
            } catch (error) {
                this.warn("Preview refresh failed", error);
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

                this.log("SVG loaded and cached", url, `${text.length} bytes`);

                this.requestPersist();

                return true;
            } catch (error) {
                this.warn(`Could not load SVG from ${url}`, error);

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


    /* ----------------------------- debug ------------------- */

    /* Quiet unless debug logging is enabled. */
    log(...args) {
        if (this.settings?.debug) {
            console.debug("[Signifier]", ...args);
        }
    }


    /* Real problems: always visible. */
    warn(...args) {
        console.warn("[Signifier]", ...args);
    }


    getDebugInfo() {
        const symbolType = symbol => {
            const value = String(symbol ?? "").trim();

            if (/^data:image\/svg\+xml/i.test(value)) {
                return "data-uri";
            }

            if (isSvgSymbol(value)) {
                return "inline-svg";
            }

            if (isUrlSymbol(value)) {
                return "url";
            }

            return "text";
        };

        const info = {
            plugin: `${this.manifest?.id} ${this.manifest?.version}`,
            obsidian: apiVersion,
            platform: Platform.isMobile ? "mobile" : "desktop",
            debug: Boolean(this.settings.debug),
            signifiers: Object.entries(this.settings.signifiers).map(
                ([key, value]) => ({
                    key,
                    enabled: value.enabled,
                    symbol: symbolType(value.symbol),
                    colorMode: value.colorMode,
                    color: value.color
                })
            ),
            svgCache: Object.keys(this.settings.svgCache),
            svgFailed: Array.from(this.svgFailed),
            svgPending: Array.from(this.svgPending.keys())
        };

        return JSON.stringify(info, null, 2);
    }


    async copyDebugInfo() {
        const text = this.getDebugInfo();

        try {
            await navigator.clipboard.writeText(text);

            new Notice("Signifier: debug info copied to clipboard.");
        } catch (error) {
            this.warn("Clipboard unavailable", error);

            console.log(text);

            new Notice(
                "Signifier: could not copy, see the developer console."
            );
        }
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