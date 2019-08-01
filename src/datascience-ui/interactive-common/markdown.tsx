// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import * as React from 'react';

import { Editor } from './editor';

export interface IMarkdownProps {
    autoFocus: boolean;
    markdown : string;
    codeTheme: string;
    testMode: boolean;
    monacoTheme: string | undefined;
    outermostParentClass: string;
    editorOptions?: monacoEditor.editor.IEditorOptions;
    editorMeasureClassName?: string;
    onSubmit(code: string): void;
    onCreated(code: string, modelId: string): void;
    onChange(changes: monacoEditor.editor.IModelContentChange[], model: monacoEditor.editor.ITextModel): void;
    arrowUp?(): void;
    arrowDown?(): void;
    focused?(): void;
    unfocused?(): void;
    escapeKeyHit?(): void;
    openLink(uri: monacoEditor.Uri): void;
}

export class Markdown extends React.Component<IMarkdownProps> {
    private editorRef: React.RefObject<Editor> = React.createRef<Editor>();

    constructor(prop: IMarkdownProps) {
        super(prop);
    }

    public render() {

        return (
                <Editor
                    codeTheme={this.props.codeTheme}
                    readOnly={false}
                    history={undefined}
                    clearOnSubmit={false}
                    onSubmit={this.props.onSubmit}
                    onCreated={this.props.onCreated}
                    onChange={this.props.onChange}
                    testMode={this.props.testMode}
                    content={this.props.markdown}
                    outermostParentClass={this.props.outermostParentClass}
                    monacoTheme={this.props.monacoTheme}
                    language='markdown'
                    editorOptions={this.props.editorOptions}
                    openLink={this.props.openLink}
                    ref={this.editorRef}
                    editorMeasureClassName={this.props.editorMeasureClassName}
                    arrowUp={this.arrowUp}
                    arrowDown={this.arrowDown}
                />
        );
    }

    public giveFocus() {
        if (this.editorRef && this.editorRef.current) {
            this.editorRef.current.giveFocus();
        }
    }

    private arrowUp = (e: monacoEditor.IKeyboardEvent, isFirstLine: boolean) => {
        if (!e.shiftKey && this.props.arrowUp && isFirstLine) {
            this.props.arrowUp();
        }
    }

    private arrowDown = (e: monacoEditor.IKeyboardEvent, isLastLine: boolean) => {
        if (!e.shiftKey && this.props.arrowDown && isLastLine) {
            this.props.arrowDown();
        }
    }

}
