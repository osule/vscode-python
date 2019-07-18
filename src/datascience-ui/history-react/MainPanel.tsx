// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import * as React from 'react';

import { noop } from '../../client/common/utils/misc';
import {
    IInteractiveWindowMapping,
    InteractiveWindowMessages
} from '../../client/datascience/interactive-window/interactiveWindowTypes';
import { ICell } from '../../client/datascience/types';
import { Cell, ICellViewModel } from '../interactive-common/cell';
import { ContentPanel, IContentPanelProps } from '../interactive-common/contentPanel';
import { IMainPanelProps } from '../interactive-common/mainPanelProps';
import { extractInputText } from '../interactive-common/mainPanelState';
import { IToolbarPanelProps, ToolbarPanel } from '../interactive-common/toolbarPanel';
import { IVariablePanelProps, VariablePanel } from '../interactive-common/variablePanel';
import { ErrorBoundary } from '../react-common/errorBoundary';
import { getLocString } from '../react-common/locReactSide';
import { getSettings } from '../react-common/settingsReactSide';

import './mainPanel.css';

export class MainPanel extends React.Component<IMainPanelProps> {
    private mainPanelRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();
    private editCellRef: React.RefObject<Cell> = React.createRef<Cell>();

    constructor(props: IMainPanelProps) {
        super(props);
        this.props.activated(this.activated);
    }

    public render() {
        return (
            <div id='main-panel' ref={this.mainPanelRef}>
                <header id='main-panel-toolbar'>
                    {this.renderToolbarPanel(this.props.baseTheme)}
                </header>
                <section id='main-panel-variable' aria-label={getLocString('DataScience.collapseVariableExplorerLabel', 'Variables')}>
                    {this.renderVariablePanel(this.props.baseTheme)}
                </section>
                <main id='main-panel-content'>
                    {this.renderContentPanel(this.props.baseTheme)}
                </main>
                <section id='main-panel-footer' aria-label={getLocString('DataScience.editSection', 'Input new cells here')}>
                    {this.renderFooterPanel(this.props.baseTheme)}
                </section>
            </div>
        );
    }

    private activated = () => {
        // Make sure the input cell gets focus
        if (getSettings && getSettings().allowInput) {
            // Delay this so that we make sure the outer frame has focus first.
            setTimeout(() => {
                // First we have to give ourselves focus (so that focus actually ends up in the code cell)
                if (this.mainPanelRef && this.mainPanelRef.current) {
                    this.mainPanelRef.current.focus({preventScroll: true});
                }

                if (this.editCellRef && this.editCellRef.current) {
                    this.editCellRef.current.giveFocus();
                }
            }, 100);
        }
    }

    private renderToolbarPanel(baseTheme: string) {
        const toolbarProps = this.getToolbarProps(baseTheme);
        return <ToolbarPanel {...toolbarProps} />;
    }

    private renderVariablePanel(baseTheme: string) {
        const variableProps = this.getVariableProps(baseTheme);
        return <VariablePanel {...variableProps} />;
    }

    private renderContentPanel(baseTheme: string) {
        // Skip if the tokenizer isn't finished yet. It needs
        // to finish loading so our code editors work.
        if (!this.props.value.tokenizerLoaded && !this.props.testMode) {
            return null;
        }

        // Otherwise render our cells.
        const contentProps = this.getContentProps(baseTheme);
        return <ContentPanel {...contentProps} />;
    }

    private renderFooterPanel(baseTheme: string) {
        // Skip if the tokenizer isn't finished yet. It needs
        // to finish loading so our code editors work.
        if (!this.props.value.tokenizerLoaded || !this.props.value.editCellVM) {
            return null;
        }

        const maxOutputSize = getSettings().maxOutputSize;
        const maxTextSize = maxOutputSize && maxOutputSize < 10000 && maxOutputSize > 0 ? maxOutputSize : undefined;
        const executionCount = this.getInputExecutionCount();
        const editPanelClass = getSettings().colorizeInputBox ? 'edit-panel-colorized' : 'edit-panel';

        return (
            <div className={editPanelClass}>
                <ErrorBoundary>
                    <Cell
                        editorOptions={this.props.value.editorOptions}
                        history={this.props.value.history}
                        maxTextSize={maxTextSize}
                        autoFocus={document.hasFocus()}
                        testMode={this.props.testMode}
                        cellVM={this.props.value.editCellVM}
                        submitNewCode={this.props.submitInput}
                        baseTheme={baseTheme}
                        codeTheme={this.props.codeTheme}
                        showWatermark={!this.props.value.submittedText}
                        gotoCode={noop}
                        copyCode={noop}
                        delete={noop}
                        editExecutionCount={executionCount}
                        onCodeCreated={this.props.editableCodeCreated}
                        onCodeChange={this.props.codeChange}
                        monacoTheme={this.props.value.monacoTheme}
                        openLink={this.openLink}
                        expandImage={noop}
                        ref={this.editCellRef}
                    />
                </ErrorBoundary>
            </div>
        );
    }

    private showPlot = (imageHtml: string) => {
        this.sendMessage(InteractiveWindowMessages.ShowPlot, imageHtml);
    }

    private getContentProps = (baseTheme: string): IContentPanelProps => {
        return {
            editorOptions: this.props.value.editorOptions,
            baseTheme: baseTheme,
            cellVMs: this.props.value.cellVMs,
            history: this.props.value.history,
            testMode: this.props.testMode,
            codeTheme: this.props.codeTheme,
            submittedText: this.props.value.submittedText,
            gotoCellCode: this.gotoCellCode,
            copyCellCode: this.copyCellCode,
            deleteCell: this.props.deleteCell,
            skipNextScroll: this.props.value.skipNextScroll ? true : false,
            monacoTheme: this.props.value.monacoTheme,
            onCodeCreated: this.props.readOnlyCodeCreated,
            onCodeChange: this.props.codeChange,
            openLink: this.openLink,
            expandImage: this.showPlot
        };
    }
    private getToolbarProps = (baseTheme: string): IToolbarPanelProps => {
       return {
        collapseAll: this.props.collapseAll,
        expandAll: this.props.expandAll,
        export: this.export,
        restartKernel: this.restartKernel,
        interruptKernel: this.interruptKernel,
        undo: this.props.undo,
        redo: this.props.redo,
        clearAll: this.props.clearAll,
        skipDefault: this.props.skipDefault,
        canCollapseAll: this.canCollapseAll(),
        canExpandAll: this.canExpandAll(),
        canExport: this.canExport(),
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        baseTheme: baseTheme
       };
    }

    private getVariableProps = (baseTheme: string): IVariablePanelProps => {
       return {
        variables: this.props.value.variables,
        pendingVariableCount: this.props.value.pendingVariableCount,
        debugging: this.props.value.debugging,
        busy: this.props.value.busy,
        showDataExplorer: this.showDataViewer,
        skipDefault: this.props.skipDefault,
        testMode: this.props.testMode,
        refreshVariables: this.props.refreshVariables,
        variableExplorerToggled: this.variableExplorerToggled,
        baseTheme: baseTheme
       };
    }

    private showDataViewer = (targetVariable: string, numberOfColumns: number) => {
        this.sendMessage(InteractiveWindowMessages.ShowDataViewer, { variableName: targetVariable, columnSize: numberOfColumns });
    }

    private sendMessage<M extends IInteractiveWindowMapping, T extends keyof M>(type: T, payload?: M[T]) {
        this.props.sendMessage<M, T>(type, payload);
    }

    private openLink = (uri: monacoEditor.Uri) => {
        this.sendMessage(InteractiveWindowMessages.OpenLink, uri.toString());
    }

    private getNonEditCellVMs() : ICellViewModel [] {
        return this.props.value.cellVMs.filter(c => !c.editable);
    }

    private canCollapseAll = () => {
        return this.getNonEditCellVMs().length > 0;
    }

    private canExpandAll = () => {
        return this.getNonEditCellVMs().length > 0;
    }

    private canExport = () => {
        return this.getNonEditCellVMs().length > 0;
    }

    private canRedo = () => {
        return this.props.value.redoStack.length > 0 ;
    }

    private canUndo = () => {
        return this.props.value.undoStack.length > 0 ;
    }

    private gotoCellCode = (index: number) => {
        // Find our cell
        const cellVM = this.props.value.cellVMs[index];

        // Send a message to the other side to jump to a particular cell
        this.sendMessage(InteractiveWindowMessages.GotoCodeCell, { file : cellVM.cell.file, line: cellVM.cell.line });
    }

    private copyCellCode = (index: number) => {
        // Find our cell
        const cellVM = this.props.value.cellVMs[index];

        // Send a message to the other side to jump to a particular cell
        this.sendMessage(InteractiveWindowMessages.CopyCodeCell, { source: extractInputText(cellVM.cell, getSettings()) });
    }

    private restartKernel = () => {
        // Send a message to the other side to restart the kernel
        this.sendMessage(InteractiveWindowMessages.RestartKernel);
    }

    private interruptKernel = () => {
        // Send a message to the other side to restart the kernel
        this.sendMessage(InteractiveWindowMessages.Interrupt);
    }

    private export = () => {
        // Send a message to the other side to export our current list
        const cellContents: ICell[] = this.props.value.cellVMs.map((cellVM: ICellViewModel, _index: number) => { return cellVM.cell; });
        this.sendMessage(InteractiveWindowMessages.Export, cellContents);
    }

    private getInputExecutionCount = () : number => {
        return this.props.value.currentExecutionCount + 1;
    }

    private variableExplorerToggled = (open: boolean) => {
        this.sendMessage(InteractiveWindowMessages.VariableExplorerToggle, open);
    }
}
