// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import './interactivePanel.less';

import * as React from 'react';

import { noop } from '../../client/common/utils/misc';
import { Cell } from '../interactive-common/cell';
import { ContentPanel, IContentPanelProps } from '../interactive-common/contentPanel';
import { InputHistory } from '../interactive-common/inputHistory';
import { createEditableCellVM, IMainState } from '../interactive-common/mainState';
import { IToolbarPanelProps, ToolbarPanel } from '../interactive-common/toolbarPanel';
import { IVariablePanelProps, VariablePanel } from '../interactive-common/variablePanel';
import { ErrorBoundary } from '../react-common/errorBoundary';
import { IKeyboardEvent } from '../react-common/event';
import { getLocString } from '../react-common/locReactSide';
import { getSettings } from '../react-common/settingsReactSide';
import { InteractivePanelStateController } from './interactivePanelStateController';

interface IInteractivePanelProps {
    skipDefault: boolean;
    testMode?: boolean;
    codeTheme: string;
    baseTheme: string;
}

export class InteractivePanel extends React.Component<IInteractivePanelProps, IMainState> {
    private mainPanelRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();
    private editCellRef: React.RefObject<Cell> = React.createRef<Cell>();
    private contentPanelRef: React.RefObject<ContentPanel> = React.createRef<ContentPanel>();
    private stateController: InteractivePanelStateController;

    constructor(props: IInteractivePanelProps) {
        super(props);

        this.state = {
            cellVMs: [],
            busy: true,
            undoStack: [],
            redoStack : [],
            submittedText: false,
            history: new InputHistory(),
            currentExecutionCount: 0,
            variables: [],
            pendingVariableCount: 0,
            debugging: false,
            knownDark: false,
            editCellVM: getSettings && getSettings().allowInput ? createEditableCellVM(1) : undefined
        };

        // Create our state controller. It manages updating our state.
        this.stateController = new InteractivePanelStateController({
            skipDefault: this.props.skipDefault,
            testMode: this.props.testMode ? true : false,
            expectingDark: this.props.baseTheme !== 'vscode-light',
            initialState: this.state,
            setState: this.setState.bind(this),
            activate: this.activated.bind(this),
            scrollToCell: this.scrollToCell.bind(this),
            defaultEditable: false
        });
    }

    public shouldComponentUpdate(_nextProps: IInteractivePanelProps, nextState: IMainState): boolean {
        return this.stateController.requiresUpdate(nextState);
    }

    public render() {
        return (
            <div id='main-panel' ref={this.mainPanelRef} role='Main'>
                <div className='styleSetter'>
                    <style>
                        {this.state.rootCss}
                    </style>
                </div>
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
                    this.editCellRef.current.giveFocus(true);
                }
            }, 100);
        }
    }

    private scrollToCell(id: string) {
        if (this.contentPanelRef && this.contentPanelRef.current) {
            this.contentPanelRef.current.scrollToCell(id);
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
        if (!this.state.tokenizerLoaded && !this.props.testMode) {
            return null;
        }

        // Otherwise render our cells.
        const contentProps = this.getContentProps(baseTheme);
        return <ContentPanel {...contentProps} ref={this.contentPanelRef} />;
    }

    private renderFooterPanel(baseTheme: string) {
        // Skip if the tokenizer isn't finished yet. It needs
        // to finish loading so our code editors work.
        if (!this.state.tokenizerLoaded || !this.state.editCellVM) {
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
                        editorOptions={this.state.editorOptions}
                        history={this.state.history}
                        maxTextSize={maxTextSize}
                        autoFocus={document.hasFocus()}
                        testMode={this.props.testMode}
                        cellVM={this.state.editCellVM}
                        baseTheme={baseTheme}
                        allowCollapse={false}
                        codeTheme={this.props.codeTheme}
                        showWatermark={true}
                        gotoCode={noop}
                        copyCode={noop}
                        delete={noop}
                        editExecutionCount={executionCount.toString()}
                        onCodeCreated={this.stateController.editableCodeCreated}
                        onCodeChange={this.stateController.codeChange}
                        monacoTheme={this.state.monacoTheme}
                        openLink={this.stateController.openLink}
                        expandImage={noop}
                        ref={this.editCellRef}
                        onClick={this.clickEditCell}
                        keyDown={this.editCellKeyDown}
                    />
                </ErrorBoundary>
            </div>
        );
    }

    private getInputExecutionCount = () : number => {
        return this.state.currentExecutionCount + 1;
    }

    private getContentProps = (baseTheme: string): IContentPanelProps => {
        return {
            editorOptions: this.state.editorOptions,
            baseTheme: baseTheme,
            cellVMs: this.state.cellVMs,
            history: this.state.history,
            testMode: this.props.testMode,
            codeTheme: this.props.codeTheme,
            submittedText: this.state.submittedText,
            gotoCellCode: this.stateController.gotoCellCode,
            copyCellCode: this.stateController.copyCellCode,
            deleteCell: this.stateController.deleteCell,
            skipNextScroll: this.state.skipNextScroll ? true : false,
            monacoTheme: this.state.monacoTheme,
            onCodeCreated: this.stateController.readOnlyCodeCreated,
            onCodeChange: this.stateController.codeChange,
            openLink: this.stateController.openLink,
            expandImage: this.stateController.showPlot,
            editable: false,
            newCellVM: undefined,
            editExecutionCount: this.getInputExecutionCount().toString()
        };
    }
    private getToolbarProps = (baseTheme: string): IToolbarPanelProps => {
       return {
        collapseAll: this.stateController.collapseAll,
        expandAll: this.stateController.expandAll,
        export: this.stateController.export,
        restartKernel: this.stateController.restartKernel,
        interruptKernel: this.stateController.interruptKernel,
        undo: this.stateController.undo,
        redo: this.stateController.redo,
        clearAll: this.stateController.clearAll,
        skipDefault: this.props.skipDefault,
        canCollapseAll: this.stateController.canCollapseAll(),
        canExpandAll: this.stateController.canExpandAll(),
        canExport: this.stateController.canExport(),
        canUndo: this.stateController.canUndo(),
        canRedo: this.stateController.canRedo(),
        baseTheme: baseTheme
       };
    }

    private getVariableProps = (baseTheme: string): IVariablePanelProps => {
       return {
        variables: this.state.variables,
        pendingVariableCount: this.state.pendingVariableCount,
        debugging: this.state.debugging,
        busy: this.state.busy,
        showDataExplorer: this.stateController.showDataViewer,
        skipDefault: this.props.skipDefault,
        testMode: this.props.testMode,
        refreshVariables: this.stateController.refreshVariables,
        variableExplorerToggled: this.stateController.variableExplorerToggled,
        baseTheme: baseTheme
       };
    }

    private clickEditCell = () => {
        if (this.editCellRef && this.editCellRef.current) {
            this.editCellRef.current.giveFocus(true);
        }
    }

    private editCellKeyDown = (_cellId: string, e: IKeyboardEvent) => {
        if (e.code === 'Escape') {
            this.editCellEscape();
        } else if (e.code === 'Enter' && e.shiftKey) {
            this.editCellSubmit(e);
        }
    }

    private editCellSubmit(e: IKeyboardEvent) {
        if (e.editorInfo && e.editorInfo.contents && this.state.editCellVM) {
            // Prevent shift+enter from turning into a enter
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            if (e.preventDefault) {
                e.preventDefault();
            }

            // Remove empty lines off the end
            let endPos = e.editorInfo.contents.length - 1;
            while (endPos >= 0 && e.editorInfo.contents[endPos] === '\n') {
                endPos -= 1;
            }
            const content = e.editorInfo.contents.slice(0, endPos + 1);

            // Send to the input history too if necessary
            if (this.state.history) {
                this.state.history.add(content, e.editorInfo.isDirty);
            }

            // Clear our current contents since we submitted
            if (e.shouldClear) {
                e.shouldClear();
            }

            // Send to jupyter
            this.stateController.submitInput(content, this.state.editCellVM);
        }
    }

    private editCellEscape = () => {
        const focusedElement = document.activeElement;
        if (focusedElement) {
            const nextTabStop = this.findTabStop(1, focusedElement);
            if (nextTabStop) {
                nextTabStop.focus();
            }
        }
    }

    private findTabStop(direction: number, element: Element) : HTMLElement | undefined {
        if (element) {
            const allFocusable = document.querySelectorAll('input, button, select, textarea, a[href]');
            if (allFocusable) {
                const tabable = Array.prototype.filter.call(allFocusable, (i: HTMLElement) => i.tabIndex >= 0);
                const self = tabable.indexOf(element);
                return direction >= 0 ? tabable[self + 1] || tabable[0] : tabable[self - 1] || tabable[0];
            }
        }
    }
}
