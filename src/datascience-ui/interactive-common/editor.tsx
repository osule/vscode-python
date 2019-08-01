// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import * as React from 'react';

import { noop } from '../../client/common/utils/misc';
import { MonacoEditor } from '../react-common/monacoEditor';
import { InputHistory } from './inputHistory';

export interface IEditorProps {
    content : string;
    codeTheme: string;
    readOnly: boolean;
    testMode: boolean;
    monacoTheme: string | undefined;
    outermostParentClass: string;
    editorOptions?: monacoEditor.editor.IEditorOptions;
    history: InputHistory | undefined;
    clearOnSubmit: boolean;
    editorMeasureClassName?: string;
    language: string;
    onSubmit(code: string): void;
    onCreated(code: string, modelId: string): void;
    onChange(changes: monacoEditor.editor.IModelContentChange[], model: monacoEditor.editor.ITextModel): void;
    openLink(uri: monacoEditor.Uri): void;
    arrowUp?(e: monacoEditor.IKeyboardEvent, isFirstLine: boolean): void;
    arrowDown?(e: monacoEditor.IKeyboardEvent, isLastLine: boolean): void;
    focused?(): void;
    unfocused?(): void;
    escapeKeyHit?(): void;
}

interface IEditorState {
    editor: monacoEditor.editor.IStandaloneCodeEditor | undefined;
    model: monacoEditor.editor.ITextModel | null;
    visibleLineCount: number;
}

export class Editor extends React.Component<IEditorProps, IEditorState> {
    private subscriptions: monacoEditor.IDisposable[] = [];
    private lastCleanVersionId: number = 0;
    private editorRef: React.RefObject<MonacoEditor> = React.createRef<MonacoEditor>();

    constructor(prop: IEditorProps) {
        super(prop);
        this.state = {editor: undefined, model: null, visibleLineCount: 0};
    }

    public componentWillUnmount = () => {
        this.subscriptions.forEach(d => d.dispose());
    }

    public render() {
        const readOnly = this.props.readOnly;
        const classes = readOnly ? 'editor-area' : 'editor-area editor-area-editable';
        const options: monacoEditor.editor.IEditorConstructionOptions = {
            minimap: {
                enabled: false
            },
            glyphMargin: false,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden'
            },
            lineNumbers: 'off',
            renderLineHighlight: 'none',
            highlightActiveIndentGuide: false,
            autoIndent: true,
            autoClosingBrackets: 'never',
            autoClosingQuotes: 'never',
            renderIndentGuides: false,
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            folding: false,
            readOnly: readOnly,
            occurrencesHighlight: false,
            selectionHighlight: false,
            lineDecorationsWidth: 0,
            contextmenu: false,
            matchBrackets: false,
            ...this.props.editorOptions
        };

        return (
            <div className={classes}>
                <MonacoEditor
                    measureWidthClassName={this.props.editorMeasureClassName}
                    testMode={this.props.testMode}
                    value={this.props.content}
                    outermostParentClass={this.props.outermostParentClass}
                    theme={this.props.monacoTheme ? this.props.monacoTheme : 'vs'}
                    language={this.props.language}
                    editorMounted={this.editorDidMount}
                    options={options}
                    openLink={this.props.openLink}
                    ref={this.editorRef}
                    lineCountChanged={this.visibleCountChanged}
                />
            </div>
        );
    }

    public giveFocus() {
        const readOnly = this.props.testMode || this.props.readOnly;
        if (this.state.editor && !readOnly) {
            this.state.editor.focus();
        }
    }

    private visibleCountChanged = (newCount: number) => {
        this.setState({visibleLineCount: newCount});
    }

    private editorDidMount = (editor: monacoEditor.editor.IStandaloneCodeEditor) => {
        // Update our state
        const model = editor.getModel();
        this.setState({ editor, model: editor.getModel() });

        // Listen for model changes
        this.subscriptions.push(editor.onDidChangeModelContent(this.modelChanged));

        // List for key up/down events if not read only
        if (!this.props.readOnly) {
            this.subscriptions.push(editor.onKeyDown(this.onKeyDown));
            this.subscriptions.push(editor.onKeyUp(this.onKeyUp));
        }

        // Indicate we're ready
        this.props.onCreated(this.props.content, model!.id);

        // Track focus changes
        this.subscriptions.push(editor.onDidFocusEditorWidget(this.props.focused ? this.props.focused : noop));
        this.subscriptions.push(editor.onDidBlurEditorWidget(this.props.unfocused ? this.props.unfocused : noop));
    }

    private modelChanged = (e: monacoEditor.editor.IModelContentChangedEvent) => {
        if (this.state.model) {
            this.props.onChange(e.changes, this.state.model);
        }
    }

    private onKeyDown = (e: monacoEditor.IKeyboardEvent) => {
        if (e.shiftKey && e.keyCode === monacoEditor.KeyCode.Enter && this.state.model && this.state.editor) {
            // Shift enter was hit
            e.stopPropagation();
            e.preventDefault();
            window.setTimeout(this.submitContent, 0);
        } else if (e.keyCode === monacoEditor.KeyCode.UpArrow) {
            this.arrowUp(e);
        } else if (e.keyCode === monacoEditor.KeyCode.DownArrow) {
            this.arrowDown(e);
        } else if (e.keyCode === monacoEditor.KeyCode.Escape && this.editorRef && this.editorRef.current && !this.editorRef.current.isSuggesting()) {
            if (this.props.escapeKeyHit) {
                this.props.escapeKeyHit();
                e.stopPropagation();
            }
        }
    }

    private onKeyUp = (e: monacoEditor.IKeyboardEvent) => {
        if (e.shiftKey && e.keyCode === monacoEditor.KeyCode.Enter) {
            // Shift enter was hit
            e.stopPropagation();
            e.preventDefault();
        }
    }

    private submitContent = () => {
        let content = this.getContents();
        if (content) {
            // Remove empty lines off the end
            let endPos = content.length - 1;
            while (endPos >= 0 && content[endPos] === '\n') {
                endPos -= 1;
            }
            content = content.slice(0, endPos + 1);

            // Send to the input history too if necessary
            if (this.props.history) {
                this.props.history.add(content, this.state.model!.getVersionId() > this.lastCleanVersionId);
            }

            // Clear our current contents since we submitted
            if (this.props.clearOnSubmit) {
                this.state.model!.setValue('');
            }

            // Send to jupyter
            this.props.onSubmit(content);
        }
    }

    private getContents() : string {
        if (this.state.model) {
            return this.state.model.getValue().replace(/\r/g, '');
        }
        return '';
    }

    private isAutoCompleteOpen() : boolean {
        if (this.editorRef.current) {
            return this.editorRef.current.isSuggesting();
        }
        return false;
    }

    private arrowUp(e: monacoEditor.IKeyboardEvent) {
        if (this.state.editor && this.state.model && !this.isAutoCompleteOpen()) {
            const cursor = this.state.editor.getPosition();
            if (cursor && cursor.lineNumber === 1 && this.props.history) {
                const currentValue = this.getContents();
                const newValue = this.props.history.completeUp(currentValue);
                if (newValue !== currentValue) {
                    this.state.model.setValue(newValue);
                    this.lastCleanVersionId = this.state.model.getVersionId();
                    this.state.editor.setPosition({lineNumber: 1, column: 1});
                    e.stopPropagation();
                }
            } else if (this.props.arrowUp) {
                const isFirstLine = cursor && cursor.lineNumber === 1 ? true : false;
                this.props.arrowUp(e, isFirstLine);
            }
        }
    }

    private arrowDown(e: monacoEditor.IKeyboardEvent) {
        if (this.state.editor && this.state.model && !this.isAutoCompleteOpen()) {
            const cursor = this.state.editor.getPosition();
            if (cursor && cursor.lineNumber === this.state.model.getLineCount() && this.props.history) {
                const currentValue = this.getContents();
                const newValue = this.props.history.completeDown(currentValue);
                if (newValue !== currentValue) {
                    this.state.model.setValue(newValue);
                    this.lastCleanVersionId = this.state.model.getVersionId();
                    const lastLine = this.state.model.getLineCount();
                    this.state.editor.setPosition({lineNumber: lastLine, column: this.state.model.getLineLength(lastLine) + 1});
                    e.stopPropagation();
                }
            } else if (this.props.arrowDown) {
                const isLastLine = cursor && cursor.lineNumber === this.state.visibleLineCount ? true : false;
                this.props.arrowDown(e, isLastLine);
            }
        }
    }

}
