import * as vscode from "vscode";

export function changeLineInRange(src: vscode.Range, line: number): vscode.Range {
    return new vscode.Range(
        new vscode.Position(line, src.start.character),
        new vscode.Position(line, src.end.character)
    );
}

export function getRemainingRangeInRange(whole: vscode.Range, scanned: vscode.Range): vscode.Range | undefined {
    if (!(whole.end.line - scanned.end.line > 1)) return undefined;
    return new vscode.Range(
        new vscode.Position(scanned.end.line + 1, scanned.end.character),
        new vscode.Position(whole.end.line, whole.end.character)
    );
}

export function connectTwoRanges(start: vscode.Range, end: vscode.Range): vscode.Range {
    return new vscode.Range(
        new vscode.Position(start.start.line, start.start.character),
        new vscode.Position(end.end.line, end.end.character)
    );
}
