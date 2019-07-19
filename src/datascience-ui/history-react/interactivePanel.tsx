// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as React from 'react';

import { noop } from '../../client/common/utils/misc';
import { Cell, ICellViewModel } from '../interactive-common/cell';
import { ContentPanel, IContentPanelProps } from '../interactive-common/contentPanel';
import { IMainPanelProps } from '../interactive-common/mainPanelProps';
import { createEditableCellVM } from '../interactive-common/mainPanelState';
import { IToolbarPanelProps, ToolbarPanel } from '../interactive-common/toolbarPanel';
import { IVariablePanelProps, VariablePanel } from '../interactive-common/variablePanel';
import { ErrorBoundary } from '../react-common/errorBoundary';
import { getLocString } from '../react-common/locReactSide';
import { getSettings } from '../react-common/settingsReactSide';

import './interactivePanel.css';

interface IInteractivePanelState {
    editCellVM?: ICellViewModel;
}

export class InteractivePanel extends React.Component<IMainPanelProps, IInteractivePanelState> {
    private mainPanelRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();
    private editCellRef: React.RefObject<Cell> = React.createRef<Cell>();

    constructor(props: IMainPanelProps) {
        super(props);
        this.props.activated(this.activated);

        this.state = {
            editCellVM: getSettings && getSettings().allowInput ? createEditableCellVM(1) : undefined
        };
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
        if (!this.props.value.tokenizerLoaded || !this.state.editCellVM) {
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
                        cellVM={this.state.editCellVM}
                        submitNewCode={this.submitInput}
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
                        openLink={this.props.openLink}
                        expandImage={noop}
                        ref={this.editCellRef}
                    />
                </ErrorBoundary>
            </div>
        );
    }

    private submitInput = (code: string) => {
        if (this.state.editCellVM) {
            this.props.submitInput(code, this.state.editCellVM);
        }
    }

    private getInputExecutionCount = () : number => {
        return this.props.value.currentExecutionCount + 1;
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
            gotoCellCode: this.props.gotoCellCode,
            copyCellCode: this.props.copyCellCode,
            deleteCell: this.props.deleteCell,
            skipNextScroll: this.props.value.skipNextScroll ? true : false,
            monacoTheme: this.props.value.monacoTheme,
            onCodeCreated: this.props.readOnlyCodeCreated,
            onCodeChange: this.props.codeChange,
            openLink: this.props.openLink,
            expandImage: this.props.showPlot
        };
    }
    private getToolbarProps = (baseTheme: string): IToolbarPanelProps => {
       return {
        collapseAll: this.props.collapseAll,
        expandAll: this.props.expandAll,
        export: this.props.export,
        restartKernel: this.props.restartKernel,
        interruptKernel: this.props.interruptKernel,
        undo: this.props.undo,
        redo: this.props.redo,
        clearAll: this.props.clearAll,
        skipDefault: this.props.skipDefault,
        canCollapseAll: this.props.canCollapseAll(),
        canExpandAll: this.props.canExpandAll(),
        canExport: this.props.canExport(),
        canUndo: this.props.canUndo(),
        canRedo: this.props.canRedo(),
        baseTheme: baseTheme
       };
    }

    private getVariableProps = (baseTheme: string): IVariablePanelProps => {
       return {
        variables: this.props.value.variables,
        pendingVariableCount: this.props.value.pendingVariableCount,
        debugging: this.props.value.debugging,
        busy: this.props.value.busy,
        showDataExplorer: this.props.showDataViewer,
        skipDefault: this.props.skipDefault,
        testMode: this.props.testMode,
        refreshVariables: this.props.refreshVariables,
        variableExplorerToggled: this.props.variableExplorerToggled,
        baseTheme: baseTheme
       };
    }
}
