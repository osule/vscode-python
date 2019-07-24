// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import * as React from 'react';

import { noop } from '../../test/core';
import { ErrorBoundary } from '../react-common/errorBoundary';
import { getSettings } from '../react-common/settingsReactSide';
import { Cell, ICellViewModel } from './cell';
import { InputHistory } from './inputHistory';
// See the discussion here: https://github.com/Microsoft/tslint-microsoft-contrib/issues/676
// tslint:disable: react-this-binding-issue
// tslint:disable-next-line:no-require-imports no-var-requires
const throttle = require('lodash/throttle') as typeof import('lodash/throttle');

export interface IContentPanelProps {
    baseTheme: string;
    cellVMs: ICellViewModel[];
    history: InputHistory;
    testMode?: boolean;
    codeTheme: string;
    submittedText: boolean;
    skipNextScroll: boolean;
    monacoTheme: string | undefined;
    editorOptions?: monacoEditor.editor.IEditorOptions;
    editable: boolean;
    editExecutionCount: string;
    editorMeasureClassName?: string;
    newCellVM?: ICellViewModel;
    gotoCellCode(cellId: string): void;
    copyCellCode(cellId: string): void;
    deleteCell(cellId: string): void;
    onCodeChange(changes: monacoEditor.editor.IModelContentChange[], cellId: string, modelId: string): void;
    onCodeCreated(code: string, file: string, cellId: string, modelId: string): void;
    openLink(uri: monacoEditor.Uri): void;
    expandImage(imageHtml: string): void;
    submitInput(code: string, cellVM: ICellViewModel): void;
    arrowUp?(cellId: string): void;
    arrowDown?(cellId: string): void;
}

export class ContentPanel extends React.Component<IContentPanelProps> {
    private bottomRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();
    private containerRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();
    private cellRefs: Map<string, React.RefObject<Cell>> = new Map<string, React.RefObject<Cell>>();
    private cellContainerRefs: Map<string, React.RefObject<HTMLDivElement>> = new Map<string, React.RefObject<HTMLDivElement>>();
    private throttledScrollIntoView = throttle(this.scrollIntoView.bind(this), 100);
    constructor(prop: IContentPanelProps) {
        super(prop);
    }

    public componentDidMount() {
        this.scrollToBottom();
    }

    public componentDidUpdate() {
        this.scrollToBottom();
    }

    public render() {
        return(
            <div id='content-panel-div' ref={this.containerRef}>
                <div id='cell-table'>
                    <div id='cell-table-body' role='list'>
                        {this.renderCells()}
                        {this.renderEdit()}
                    </div>
                </div>
                <div ref={this.bottomRef}/>
            </div>
        );
    }

    public scrollToCell(cellId: string) {
        const ref = this.cellContainerRefs.get(cellId);
        if (ref && ref.current) {
            ref.current.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
            ref.current.classList.add('flash');
            setTimeout(() => {
                if (ref.current) {
                    ref.current.classList.remove('flash');
                }
            }, 1000);
        }
    }

    public focusCell(cellId: string) {
        const ref = this.cellContainerRefs.get(cellId);
        if (ref && ref.current) {
            ref.current.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
            const cellRef = this.cellRefs.get(cellId);
            if (cellRef && cellRef.current) {
                cellRef.current.giveFocus();
            }
        }
    }

    private renderCells = () => {
        const maxOutputSize = getSettings().maxOutputSize;
        const maxTextSize = maxOutputSize && maxOutputSize < 10000 && maxOutputSize > 0 ? maxOutputSize : undefined;
        const baseTheme = getSettings().ignoreVscodeTheme ? 'vscode-light' : this.props.baseTheme;

        return this.props.cellVMs.map((cellVM: ICellViewModel, index: number) =>
            this.renderCell(cellVM, index, baseTheme, maxTextSize, false, false));
    }

    private renderEdit = () => {
        if (this.props.editable && this.props.newCellVM) {
            const maxOutputSize = getSettings().maxOutputSize;
            const maxTextSize = maxOutputSize && maxOutputSize < 10000 && maxOutputSize > 0 ? maxOutputSize : undefined;
            const baseTheme = getSettings().ignoreVscodeTheme ? 'vscode-light' : this.props.baseTheme;
            return this.renderCell(this.props.newCellVM, 0, baseTheme, maxTextSize, true, true);
        } else {
            return null;
        }
    }

    private renderCell(cellVM: ICellViewModel, index: number, baseTheme: string, maxTextSize: number | undefined, showWatermark: boolean, clearOnSubmit: boolean): JSX.Element {
        const cellRef = React.createRef<Cell>();
        const ref = React.createRef<HTMLDivElement>();
        this.cellRefs.set(cellVM.cell.id, cellRef);
        this.cellContainerRefs.set(cellVM.cell.id, ref);
        const arrowUp = this.props.arrowUp ? () => this.props.arrowUp!(cellVM.cell.id) : undefined;
        const arrowDown = this.props.arrowDown ? () => this.props.arrowDown!(cellVM.cell.id) : undefined;
        const gotoCode = () => this.props.gotoCellCode(cellVM.cell.id);
        const copyCode = () => this.props.copyCellCode(cellVM.cell.id);
        const deleteCell = () => this.props.deleteCell(cellVM.cell.id);
        return (
            <div key={index} id={cellVM.cell.id} ref={ref}>
                <ErrorBoundary key={index}>
                    <Cell
                        ref={cellRef}
                        role='listitem'
                        editorOptions={this.props.editorOptions}
                        history={undefined}
                        maxTextSize={maxTextSize}
                        autoFocus={false}
                        testMode={this.props.testMode}
                        cellVM={cellVM}
                        submitNewCode={this.props.editable ? this.props.submitInput : noop}
                        baseTheme={baseTheme}
                        codeTheme={this.props.codeTheme}
                        allowCollapse={!this.props.editable}
                        showWatermark={showWatermark}
                        editExecutionCount={this.props.editExecutionCount}
                        gotoCode={gotoCode}
                        copyCode={copyCode}
                        delete={deleteCell}
                        onCodeChange={this.props.onCodeChange}
                        onCodeCreated={this.props.onCodeCreated}
                        monacoTheme={this.props.monacoTheme}
                        openLink={this.props.openLink}
                        expandImage={this.props.expandImage}
                        clearOnSubmit={clearOnSubmit}
                        editorMeasureClassName={this.props.editorMeasureClassName}
                        arrowUp={arrowUp}
                        arrowDown={arrowDown}
                    />
                </ErrorBoundary>
            </div>);
    }

    private scrollIntoView() {
        // Force auto here as smooth scrolling can be canceled by updates to the window
        // from elsewhere (and keeping track of these would make this hard to maintain)
        if (this.bottomRef.current) {
            this.bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
        }
    }

    private scrollToBottom() {
        if (this.bottomRef.current && !this.props.skipNextScroll && !this.props.testMode && this.containerRef.current) {
            // Make sure to debounce this so it doesn't take up too much time.
            this.throttledScrollIntoView();
        }
    }

}
