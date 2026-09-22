# Google C++ Style Checker

## what is this

VS Code extension that checks `.cpp` files using `clang-format`

If the code is different from the Google style formatting, it shows a warning

---

## requirements

* VS Code
* Node.js
* clang-format

Check clang-format with

```bash
clang-format --version
```

clang-format must be in your system's PATH for the extension to work

---

## how it works

```text
cpp file
   ->
clang-format
   ->
compare
   ->
warning if different
```

The extension sends the file to clang-format through stdin instead of using a temporary file

---

## main functions

### `activate()`

Starts the extension

Sets up the commands and events for opening, changing and closing files

---

### `deactivate()`

Cleans up the timers and diagnostics when the extension stops

---

### `scheduleCheck()`

Adds a small delay before checking the file

This stops clang-format from running on every keystroke

---

### `checkDocument()`

Runs clang-format on the current document

Sends the document through stdin and gets the formatted version from stdout

---

### `updateDiagnostics()`

Compares the original file with the clang-format output

Creates warnings when they are different

---

### `normalizeText()`

Makes different newline types the same

Mostly for Windows `\r\n` vs `\n`

---

### `findFirstDifference()`

Finds the first character that is different between two lines

Used to put the warning closer to the actual problem

---

## clang-format

The extension uses Google style with

```text
BasedOnStyle: Google
IndentWidth: 2
UseTab: Never
```

It also uses

```text
--assume-filename=source.cpp
```

so clang-format knows the input is C++

---

## AI declaration

The project was created with an assistance of AI tools with the following use-cases:

* Asking the agent proper syntax standards for typescript and proper ways to interact with VSCode API
* Providing code snippets for some functions of the codebase
* Grammar checking this README

