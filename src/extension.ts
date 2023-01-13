import debounce from 'lodash/debounce'
import groupBy from 'lodash/groupBy'
import { z } from "zod"
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import memoizeOne from "memoize-one"

interface LowlightRange {
	range: vscode.Range,
	opacity: number
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const logger = vscode.window.createOutputChannel('lowlight-patterns')
	const decorationTypeMapping = new WeakMap<vscode.TextEditor, vscode.TextEditorDecorationType[]>()

	const addDecorations = (editor: vscode.TextEditor) => {
		const doc = editor.document
		if (doc.uri.scheme !== 'file') return
		const nConfig = getNormalizedConfig()

		let ranges: LowlightRange[] = []

		for (const rule of nConfig.rules) {
			if (rule.filePattern && !doc.uri.path.match(rule.filePattern)) {
				continue
			}
			for (const range of editor.visibleRanges) {
				logger.appendLine(`Visible range: ${doc.uri}:${range.start.line}-${range.end.line}`)
				const scanRange = getScanRange(doc, range)
				logger.appendLine(`Scanning range: ${doc.uri}:${scanRange.start}-${scanRange.end}`)

				for (let lineNum = scanRange.start; lineNum <= scanRange.end; lineNum++) {
					let startLine
					try {
						startLine = doc.lineAt(lineNum)
					} catch (e: any) {
						logger.appendLine(`Failed to get line: ${lineNum}: ${e.message}`)
						continue
					}

					const startLineOffset = doc.offsetAt(startLine.range.start)
					const startMatches = startLine.text.matchAll(rule.start)

					for (const startMatch of startMatches) {
						if (typeof startMatch.index === 'undefined') continue
						if (rule.end) {
							// Range is delimited by start and end patterns should
							let gotEndMatch = false
							for (let endLineNum = lineNum; endLineNum < editor.document.lineCount; endLineNum++) {
								const endLine = editor.document.lineAt(endLineNum)
								const endMatches = endLine.text.matchAll(rule.end)
								for (const endMatch of endMatches) {
									if (typeof endMatch.index === 'undefined') continue
									if (endLineNum > lineNum || endMatch.index > startMatch.index) {
										gotEndMatch = true
										const range = toDocRange(
											doc,
											{ line: startLine, idx: startMatch.index },
											{ line: endLine, idx: endMatch.index + endMatch[0].length }
										)
										logger.appendLine(`lowlight block range: ${describeRange(range)}`)
										ranges.push({
											opacity: rule.opacity ?? nConfig.opacity,
											range
										})
										break
									}
								}
								if (gotEndMatch) break
							}
							if (!gotEndMatch) {
								logger.appendLine(`Failed to find block end for pattern start: ${startMatch[0]}`)
							}
						} else {
							// Range is a single fragment identified by regex
							const range = toDocRange(
								doc,
								{ line: startLine, idx: startMatch.index },
								{ line: startLine, idx: startMatch.index + startMatch[0].length }
							)
							logger.appendLine(`lowlight fragment range: ${describeRange(range)}`)
							ranges.push({
								opacity: rule.opacity ?? nConfig.opacity,
								range
							})
						}
					}
				}
			}
		}

		for (const decoration of decorationTypeMapping.get(editor) ?? []) {
			decoration.dispose()
		}

		const decorationTypes: vscode.TextEditorDecorationType[] = []

		for (const [opacity, rangeGroup] of Object.entries(
			groupBy(ranges, it => it.opacity)
		)) {
			const decoration = vscode.window.createTextEditorDecorationType({
				opacity,
				isWholeLine: false,
			})
			decorationTypes.push(decoration)
			editor.setDecorations(decoration, rangeGroup.map(it => it.range))
		}

		decorationTypeMapping.set(editor, decorationTypes)
		logger.appendLine('Applied all decorations')
	}

	const scheduleAddDecorations = debounce(addDecorations, 200)

	vscode.window.onDidChangeActiveTextEditor(
		editor => {
			if (editor) {
				scheduleAddDecorations(editor)
			}
		}
	)

	vscode.workspace.onDidChangeTextDocument(
		event => {
			var activeEditor = vscode.window.activeTextEditor
			if (activeEditor && event.document === activeEditor.document) {
				scheduleAddDecorations(activeEditor)
			}
		}
	)

	vscode.window.onDidChangeTextEditorVisibleRanges(
		event => {
			scheduleAddDecorations(event.textEditor)
		}
	)

	if (vscode.window.activeTextEditor) {
		scheduleAddDecorations(vscode.window.activeTextEditor)
	}
}

const getScanRange = (doc: vscode.TextDocument, visibleRange: vscode.Range) => {
	const start = Math.max(0, visibleRange.start.line - 20)
	const end = Math.min(visibleRange.end.line + 20, doc.lineCount - 1)
	return { start, end }
}

const getNormalizedConfig = () => {
	return normalizeConfig(
		vscode.workspace.getConfiguration('lowlight-patterns')
	)
}

const normalizeConfig = memoizeOne((config: any) => {
	return {
		opacity: config.opacity as number,
		rules: parseRules(config['rules']),
	}
})

interface NormalizedRule {
	start: RegExp
	end?: RegExp | null
	opacity?: number | null
	filePattern?: RegExp | null
}

const singlePatternInputSchema = z.string().transform((arg): NormalizedRule => ({
	start: toRegex(arg)
}))

const patternPairInputSchema = z.tuple([
	z.string(),
	z.string()
]).transform(([start, end]): NormalizedRule => ({
	start: toRegex(start),
	end: toRegex(end)
}))

const patternObjInputSchema = z.object({
	start: z.string(),
	end: z.string().nullish(),
	opacity: z.number().nullish(),
	filePattern: z.string().nullish()
}).transform((i): NormalizedRule => ({
	start: toRegex(i.start),
	end: i.end ? toRegex(i.end) : null,
	filePattern: i.filePattern ? toRegex(i.filePattern) : null,
	opacity: i.opacity
}))

const patternInputSchema = singlePatternInputSchema
	.or(patternPairInputSchema)
	.or(patternObjInputSchema)

const parseRules = (inputPatterns: any[]): NormalizedRule[] => {
	const normalized: NormalizedRule[] = []
	for (const inputPattern of inputPatterns) {
		const parsed = patternInputSchema.safeParse(inputPattern)
		if (!parsed.success) {
			console.error('Ignoring invalid pattern: ', inputPattern)
			continue
		}
		normalized.push(parsed.data)
	}
	return normalized
}

const toRegex = (strPattern: string) =>
	new RegExp(strPattern, 'g')

interface LinePos {
	line: vscode.TextLine,
	idx: number
}

const toDocRange = (doc: vscode.TextDocument, start: LinePos, end: LinePos) => {
	const startLineOffset = doc.offsetAt(start.line.range.start)
	const endLineOffset = doc.offsetAt(end.line.range.start)
	return new vscode.Range(
		doc.positionAt(startLineOffset + start.idx),
		doc.positionAt(endLineOffset + end.idx)
	)
}

const describeRange = (range: vscode.Range) =>
	`${range.start.line}:${range.start.character} - ${range.end.line}:${range.end.character}`

// this method is called when your extension is deactivated
export function deactivate() { }