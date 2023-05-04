import * as vscode from "vscode";
import * as models from "./models";
import * as utilities from "./utilities";

export class EditorDecorator {
    _logger: vscode.OutputChannel;
    _decorationTypeMapping: WeakMap<vscode.TextEditor, models.DecorationTypes>;

    constructor() {
        this._logger = vscode.window.createOutputChannel("lowlight-patterns");
        this._decorationTypeMapping = new WeakMap<vscode.TextEditor, models.DecorationTypes>();
    }

    _getAllVisibleRanges(editor: vscode.TextEditor, config: models.Config): vscode.Range[] {
        const limitRange = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(config.maxNumberOfLinesToScan, 0)
        );
        return editor.visibleRanges.map((range) => {
            return range.intersection(limitRange) ?? limitRange;
        });
    }

    _getMatchInLine(lineContent: vscode.TextLine, regexp: RegExp): vscode.Range | undefined {
        const matches = [...lineContent.text.matchAll(regexp)];
        if (matches.length == 0) return undefined;
        const match = matches[0];
        if (match.index == undefined || match.length == undefined) return undefined;
        const start = new vscode.Position(0, match.index);
        const end = new vscode.Position(0, match.index + match[0].length);
        return new vscode.Range(start, end);
    }

    _scanRangeForRegex(editor: vscode.TextEditor, range: vscode.Range, regex: RegExp): vscode.Range | undefined {
        for (let line = range.start.line; line <= range.end.line; line++) {
            var lineContent;
            try {
                lineContent = editor.document.lineAt(line);
            } catch (e: any) {
                this._logger.appendLine(`Failed to get line: ${line}: ${e.message}`);
                continue;
            }
            const foundPos = this._getMatchInLine(lineContent, regex);
            if (foundPos) return utilities.changeLineInRange(foundPos, line);
        }
        return undefined;
    }

    _scanRangeForRule(editor: vscode.TextEditor, range: vscode.Range, rule: models.Rule): vscode.Range | undefined {
        if ("rule" in rule) {
            const match = this._scanRangeForRegex(editor, range, rule["rule"]);
            return match;
        } else if ("startRule" in rule && "endRule" in rule) {
            const startMatch = this._scanRangeForRegex(editor, range, rule["startRule"]);
            if (startMatch === undefined) return undefined;
            const remainingRange = utilities.getRemainingRangeInRange(range, startMatch);
            if (remainingRange === undefined) return undefined;
            const endMatch = this._scanRangeForRegex(editor, remainingRange, rule["endRule"]);
            if (endMatch === undefined) return undefined;
            return utilities.connectTwoRanges(startMatch, endMatch);
        }
        return undefined;
    }

    _prepareDecorationTypes(config: models.Config): models.DecorationTypes {
        return {
            "max": vscode.window.createTextEditorDecorationType({
                "opacity": config.maxOpacity.toString(),
                "isWholeLine": false,
            }),
            "mid": vscode.window.createTextEditorDecorationType({
                "opacity": config.midOpacity.toString(),
                "isWholeLine": false,
            }),
            "min": vscode.window.createTextEditorDecorationType({
                "opacity": config.minOpacity.toString(),
                "isWholeLine": false,
            }),
        };
    }

    _getPerDecorationTypeQueue(): models.PerDecorationQueue {
        return {
            "max": [] as vscode.Range[],
            "mid": [] as vscode.Range[],
            "min": [] as vscode.Range[],
        };
    }

    _saveMatchToQueue(queues: models.PerDecorationQueue, match: vscode.Range, rule: models.Rule) {
        switch (rule.opacity) {
            case models.Opacity.Max:
                queues.max.push(match);
                break;
            case models.Opacity.Mid:
                queues.mid.push(match);
                break;
            case models.Opacity.Min:
                queues.min.push(match);
                break;
        }
    }

    _disposeLastDecorations(editor: vscode.TextEditor) {
        const decoTypes = this._decorationTypeMapping.get(editor);
        if (decoTypes == undefined) return;
        decoTypes.max.dispose();
        decoTypes.mid.dispose();
        decoTypes.min.dispose();
    }

    _applyNewDecorations(editor: vscode.TextEditor, config: models.Config, perDecoQueues: models.PerDecorationQueue) {
        const decoTypes = this._prepareDecorationTypes(config);
        editor.setDecorations(decoTypes.max, perDecoQueues.max);
        editor.setDecorations(decoTypes.mid, perDecoQueues.mid);
        editor.setDecorations(decoTypes.min, perDecoQueues.min);
        this._decorationTypeMapping.set(editor, decoTypes);
    }

    decorateEditor(editor: vscode.TextEditor) {
        if (editor.document.uri.scheme !== "file") return;

        const config = models.readConfig(editor);
        if (config == undefined || config.rules == undefined) return;

        console.log(config);

        const ranges = this._getAllVisibleRanges(editor, config);
        const perDecoQueues = this._getPerDecorationTypeQueue();
        for (const rule of config.rules) {
            for (const range of ranges) {
                const match = this._scanRangeForRule(editor, range, rule);
                if (match == undefined) continue;
                this._saveMatchToQueue(perDecoQueues, match, rule);
            }
        }

        this._disposeLastDecorations(editor);
        this._applyNewDecorations(editor, config, perDecoQueues);

        this._logger.appendLine("Applied all decorations");
    }
}
