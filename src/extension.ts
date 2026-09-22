import * as vscode from "vscode";
import { spawn } from "node:child_process";

const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("google-cpp-style");

// timer to not run clang each keystroke
const debounceTimers = new Map<string, NodeJS.Timeout>();

//sets up the extension and events
//checks cpp files on open and change
//registers a command for manual use
export function activate(context: vscode.ExtensionContext): void {
    console.log("Google C++ Style extension activated.");

    const checkCommand = vscode.commands.registerCommand("googleCppStyle.check",(): void => 
		{const editor = vscode.window.activeTextEditor;
            if (editor !== undefined) {
                scheduleCheck(editor.document, 0);
            }
        }
    );

    context.subscriptions.push(checkCommand);
    context.subscriptions.push(diagnosticCollection);

    //check already opened file
    if (vscode.window.activeTextEditor !== undefined) {
        scheduleCheck(
            vscode.window.activeTextEditor.document,
            0
        );
    }

    //check new opened files
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(
            (document: vscode.TextDocument): void => {
                scheduleCheck(document, 0);
            }
        )
    );

    //check edited files
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(
            (event: vscode.TextDocumentChangeEvent): void => {
                scheduleCheck(event.document);
            }
        )
    );

    //clear all vars on file close
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(
            (document: vscode.TextDocument): void => {
                const key = document.uri.toString();

                const timer = debounceTimers.get(key);

                if (timer !== undefined) {
                    clearTimeout(timer);
                    debounceTimers.delete(key);
                }

                diagnosticCollection.delete(document.uri);
            }
        )
    );
}

//clean up timer and diagnosticks on deactivation
export function deactivate(): void {
    for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
    }

    debounceTimers.clear();
    diagnosticCollection.dispose();
}

//timer
function scheduleCheck(
    document: vscode.TextDocument,
    delay = 300
): void {
    if (document.languageId !== "cpp") {
        return;
    }

    const key = document.uri.toString();

    const existingTimer = debounceTimers.get(key);

    if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout((): void => {
        debounceTimers.delete(key);
        checkDocument(document);
    }, delay);

    debounceTimers.set(key, timer);
}


//runs clang-format against the active document
//the document is sent through input stream, not temp file, which is questionable
//IMPORTANT: include --assume-filename for \n reasons
function checkDocument(document: vscode.TextDocument): void {
    if (document.languageId !== "cpp") {
        return;
    }

    const config = vscode.workspace.getConfiguration("googleCppStyle");

    const clangFormatPath = config.get<string>("clangFormatPath") ?? "clang-format";

    const child = spawn(
        clangFormatPath,
        [
            "--style={BasedOnStyle: Google, IndentWidth: 2, UseTab: Never}",
            "--assume-filename=source.cpp"
        ],
        {
            stdio: ["pipe", "pipe", "pipe"]
        }
    );

    let stdout = "";
    let stderr = "";

    //clang-format writes the formatted source to stdout
    child.stdout.on("data", (data: Buffer): void => {stdout += data.toString();});

    //log stderr just in case
    child.stderr.on("data", (data: Buffer): void => {stderr += data.toString();}
    );

    //in case of not installed clang-format
    child.on("error", (error: Error): void => {console.error(`Failed to start clang-format: ${error.message}`); vscode.window.showErrorMessage(`Could not start clang-format: ${error.message}`);});

    //compare clang-format output with the document content
    child.on("close",(code: number | null): void => {
            if (code !== 0) {
                console.error(`clang-format exited with code ${code}.`);

                if (stderr.length > 0) {
                    console.error(stderr);
                }

                return;
            }

            updateDiagnostics(
                document,
                stdout
            );
        }
    );

    //send the activate document to clang-format via input stream
    child.stdin.write(document.getText());
    child.stdin.end();
}

//create warnings
function updateDiagnostics(document: vscode.TextDocument, formattedText: string): void {
    const original = normalizeText(
        document.getText()
    );

    const formatted = normalizeText(
        formattedText
    );

    // The file already follows the requested style.
    if (original === formatted) {
        diagnosticCollection.delete(
            document.uri
        );

        return;
    }

    const originalLines = original.split("\n");
    const formattedLines = formatted.split("\n");

    const diagnostics: vscode.Diagnostic[] = [];

    const lineCount = Math.min(originalLines.length, formattedLines.length);

    for (let line = 0; line < lineCount; line++) {
        const originalLine = originalLines[line] ?? "";

        const formattedLine = formattedLines[line] ?? "";

        if (originalLine === formattedLine) {
            continue;
        }

        const startColumn =findFirstDifference(originalLine, formattedLine);

        const endColumn = Math.max(startColumn + 1, originalLine.length);

        const range = new vscode.Range(line, startColumn, line, endColumn);

        const message =
            "Google C++ Style formatting differs.\n\n" +
            `Current:\n${originalLine}\n\n` +
            `Expected:\n${formattedLine}`;

        const diagnostic = new vscode.Diagnostic(range,message, vscode.DiagnosticSeverity.Warning);

        diagnostic.source = "Google C++ Style";

        diagnostics.push(diagnostic);
    }

    //handle additional and remove lines by clang-format
    if (originalLines.length !== formattedLines.length) {
        const firstExtraLine = lineCount;

        const lineText = originalLines[firstExtraLine] ?? "";

        const range = new vscode.Range(firstExtraLine, 0, firstExtraLine, lineText.length);

        const expected = formattedLines[firstExtraLine] ?? "";

        const diagnostic =
            new vscode.Diagnostic(
                range,
                "Google C++ Style formatting differs.\n\n" +
                `Current:\n${lineText}\n\n` +
                `Expected:\n${expected}`,
                vscode.DiagnosticSeverity.Warning
            );

        diagnostic.source =
            "Google C++ Style";

        diagnostics.push(diagnostic);
    }

    diagnosticCollection.set(
        document.uri,
        diagnostics
    );
}

//normalize different newline types (mostly windows' fault)
function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
}

//find the first character, which is different from clang-format
function findFirstDifference(
    original: string,
    formatted: string
): number {
    const length = Math.min(
        original.length,
        formatted.length
    );

    for (let i = 0; i < length; i++) {
        if (original[i] !== formatted[i]) {
            return i;
        }
    }

    return length;
}

