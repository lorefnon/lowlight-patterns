import * as vscode from "vscode";

export enum Opacity {
    Max = 1,
    Mid,
    Min,
}

export interface MultilineRule {
    endRule: RegExp;
    startRule: RegExp;
    opacity: Opacity | undefined;
}

export interface OnelineRule {
    rule: RegExp;
    opacity: Opacity | undefined;
}

export type Rule = MultilineRule | OnelineRule;

export interface Config {
    rules: Rule[];
    maxOpacity: number;
    midOpacity: number;
    minOpacity: number;
    maxNumberOfLinesToScan: number;
}

function readRules(vscodeConfig: vscode.WorkspaceConfiguration, defaultOpacity: Opacity): Rule[] {
    const jsonRules = vscodeConfig.get("rules") ?? [];
    if (!Array.isArray(jsonRules)) return [];

    return jsonRules.map((rule) => {
        if ("rule" in rule) {
            return {
                rule: new RegExp(rule["rule"], "g"),
                opacity: rule["opacity"] ?? defaultOpacity,
            };
        } else {
            return {
                startRule: new RegExp(rule["startRule"], "g"),
                endRule: new RegExp(rule["endRule"], "g"),
                opacity: rule["opacity"] ?? defaultOpacity,
            };
        }
    });
}

export function readConfig(editor: vscode.TextEditor): Config {
    const vscodeConfig = vscode.workspace.getConfiguration("lowlight-patterns", editor.document.uri);
    return {
        rules: readRules(vscodeConfig, vscodeConfig.get("opacity") ?? Opacity.Mid),
        minOpacity: vscodeConfig.get("minOpacity") ?? 0.25,
        midOpacity: vscodeConfig.get("midOpacity") ?? 0.5,
        maxOpacity: vscodeConfig.get("maxOpacity") ?? 0.75,
        maxNumberOfLinesToScan: vscodeConfig.get("maxNumberOfLinesToScan") ?? 1000,
    };
}

export interface PerDecorationQueue {
    "max": vscode.Range[];
    "mid": vscode.Range[];
    "min": vscode.Range[];
}

export interface DecorationTypes {
    "max": vscode.TextEditorDecorationType;
    "mid": vscode.TextEditorDecorationType;
    "min": vscode.TextEditorDecorationType;
}
