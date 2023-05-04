import debounce from "lodash/debounce";
import * as vscode from "vscode";
import * as models from "./models";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const editorDecorator = new EditorDecorator();

    const schedule = debounce(editorDecorator._decorateEditor.bind(editorDecorator));

    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor != undefined) schedule(editor);
    });

    vscode.workspace.onDidChangeTextDocument((event) => {
        if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document)
            schedule(vscode.window.activeTextEditor);
    });

    if (vscode.window.activeTextEditor) {
        schedule(vscode.window.activeTextEditor);
    }
}

class EditorDecorator {
    logger: vscode.OutputChannel;
    decorationTypeMapping: WeakMap<vscode.TextEditor, vscode.TextEditorDecorationType[]>;

    constructor() {
        this.logger = vscode.window.createOutputChannel("lowlight-patterns");
        this.decorationTypeMapping = new WeakMap<vscode.TextEditor, vscode.TextEditorDecorationType[]>();
    }

    _readConfig(editor: vscode.TextEditor, prop: string) {
        return vscode.workspace.getConfiguration("lowlight-patterns", editor.document.uri).get(prop);
    }

    _loadConfig(editor: vscode.TextEditor): models.Config | undefined {
        return vscode.workspace.getConfiguration("lowlight-patterns", editor.document.uri).get("rules");
    }

    _decorateEditor(editor: vscode.TextEditor) {
        if (editor.document.uri.scheme !== "file") return;

        const config = this._loadConfig(editor);
        if (config == undefined || config.rules == undefined) return;

        const ranges = this._getAllVisibleRanges(editor);

        for (const rule of config.rules) {
            for (const range of ranges) {
                this._scanRangeForRule(editor, range, rule);
            }
        }

        for (const decoration of this.decorationTypeMapping.get(editor) ?? []) {
            decoration.dispose();
        }

        const decorationTypes: vscode.TextEditorDecorationType[] = [];

        // for (const [opacity, rangeGroup] of Object.entries(groupBy(ranges, (it) => it.opacity))) {
        //     const decoration = vscode.window.createTextEditorDecorationType({
        //         opacity,
        //         isWholeLine: false,
        //     });
        //     decorationTypes.push(decoration);
        //     editor.setDecorations(
        //         decoration,
        //         rangeGroup.map((it) => it.range)
        //     );
        // }

        this.decorationTypeMapping.set(editor, decorationTypes);
        this.logger.appendLine("Applied all decorations");
    }

    _cascadeStyleForRule(config: models.Config, rule: models.Rule) {}

    _applyDecorations() {}

    _getAllVisibleRanges(editor: vscode.TextEditor): vscode.Range[] {
        let limit = parseInt(
            vscode.workspace.getConfiguration("lowlight-patterns", editor.document).get("maxNumberOfLinesToScan") ?? ""
        );
        if (limit === undefined) {
            limit = 1000;
        }

        const limitRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(limit, 0));

        return editor.visibleRanges.map((range) => {
            return range.intersection(limitRange) ?? limitRange;
        });
    }

    _scanRangeForRule(editor: vscode.TextEditor, range: vscode.Range, rule: any) {
        const doc = editor.document;

        // for (const range of editor.visibleRanges) {
        //     const scanRange = utilities.getSafeScanRange(doc, range);

        //     for (let lineNum = scanRange.start; lineNum <= scanRange.end; lineNum++) {
        //         let startLine;
        //         try {
        //             startLine = doc.lineAt(lineNum);
        //         } catch (e: any) {
        //             this.logger.appendLine(`Failed to get line: ${lineNum}: ${e.message}`);
        //             continue;
        //         }

        //         const startLineOffset = doc.offsetAt(startLine.range.start);
        //         const startMatches = startLine.text.matchAll(rule.start);

        //         for (const startMatch of startMatches) {
        //             if (typeof startMatch.index === "undefined") continue;
        //             if (rule.end) {
        //                 // Range is delimited by start and end patterns should
        //                 let gotEndMatch = false;
        //                 for (let endLineNum = lineNum; endLineNum < editor.document.lineCount; endLineNum++) {
        //                     const endLine = editor.document.lineAt(endLineNum);
        //                     const endMatches = endLine.text.matchAll(rule.end);
        //                     for (const endMatch of endMatches) {
        //                         if (typeof endMatch.index === "undefined") continue;
        //                         if (endLineNum > lineNum || endMatch.index > startMatch.index) {
        //                             gotEndMatch = true;
        //                             const range = toDocRange(
        //                                 doc,
        //                                 { line: startLine, idx: startMatch.index },
        //                                 { line: endLine, idx: endMatch.index + endMatch[0].length }
        //                             );
        //                             this.logger.appendLine(`lowlight block range: ${describeRange(range)}`);
        //                             ranges.push({
        //                                 opacity: rule.opacity ?? config.opacity,
        //                                 range,
        //                             });
        //                             break;
        //                         }
        //                     }
        //                     if (gotEndMatch) break;
        //                 }
        //                 if (!gotEndMatch) {
        //                     this.logger.appendLine(`Failed to find block end for pattern start: ${startMatch[0]}`);
        //                 }
        //             } else {
        //                 // Range is a single fragment identified by regex
        //                 const range = toDocRange(
        //                     doc,
        //                     { line: startLine, idx: startMatch.index },
        //                     { line: startLine, idx: startMatch.index + startMatch[0].length }
        //                 );
        //                 this.logger.appendLine(`lowlight fragment range: ${describeRange(range)}`);
        //                 ranges.push({
        //                     opacity: rule.opacity ?? config.opacity,
        //                     range,
        //                 });
        //             }
        //         }
        //     }
        // }
    }
}

interface LinePos {
    line: vscode.TextLine;
    idx: number;
}

const toDocRange = (doc: vscode.TextDocument, start: LinePos, end: LinePos) => {
    const startLineOffset = doc.offsetAt(start.line.range.start);
    const endLineOffset = doc.offsetAt(end.line.range.start);
    return new vscode.Range(doc.positionAt(startLineOffset + start.idx), doc.positionAt(endLineOffset + end.idx));
};

const describeRange = (range: vscode.Range) =>
    `${range.start.line}:${range.start.character} - ${range.end.line}:${range.end.character}`;

// this method is called when your extension is deactivated
export function deactivate() {}
