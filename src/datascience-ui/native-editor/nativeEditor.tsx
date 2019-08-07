// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import './nativeEditor.less';

import * as React from 'react';

import { concatMultilineString } from '../../client/datascience/common';
import { Identifiers } from '../../client/datascience/constants';
import { ICell } from '../../client/datascience/types';
import { Cell, ICellViewModel } from '../interactive-common/cell';
import { ContentPanel, IContentPanelProps } from '../interactive-common/contentPanel';
import { InputHistory } from '../interactive-common/inputHistory';
import { createEditableCellVM, IMainState } from '../interactive-common/mainState';
import { IVariablePanelProps, VariablePanel } from '../interactive-common/variablePanel';
import { Button } from '../react-common/button';
import { IKeyboardEvent } from '../react-common/event';
import { Image, ImageName } from '../react-common/image';
import { ImageButton } from '../react-common/imageButton';
import { getLocString } from '../react-common/locReactSide';
import { getSettings } from '../react-common/settingsReactSide';
import { NativeEditorStateController } from './nativeEditorStateController';

interface INativeEditorProps {
    skipDefault: boolean;
    testMode?: boolean;
    codeTheme: string;
    baseTheme: string;
}

export class NativeEditor extends React.Component<INativeEditorProps, IMainState> {
    private mainPanelRef: React.RefObject<HTMLDivElement> = React.createRef<HTMLDivElement>();
    private editCellRef: React.RefObject<Cell> = React.createRef<Cell>();
    private contentPanelRef: React.RefObject<ContentPanel> = React.createRef<ContentPanel>();
    private stateController: NativeEditorStateController;

    constructor(props: INativeEditorProps) {
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
            editCellVM: createEditableCellVM(1)
        };

        // Create our state controller. It manages updating our state.
        this.stateController = new NativeEditorStateController({
            skipDefault: this.props.skipDefault,
            testMode: this.props.testMode ? true : false,
            expectingDark: this.props.baseTheme !== 'vscode-light',
            initialState: this.state,
            setState: this.setState.bind(this),
            activate: this.activated.bind(this),
            scrollToCell: this.scrollToCell.bind(this),
            defaultEditable: true
        });
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
                    {this.renderToolbarPanel()}
                </header>
                <section id='main-panel-variable' aria-label={getLocString('DataScience.collapseVariableExplorerLabel', 'Variables')}>
                    {this.renderVariablePanel(this.props.baseTheme)}
                </section>
                <main id='main-panel-content'>
                    {this.renderContentPanel(this.props.baseTheme)}
                </main>
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

    // tslint:disable: react-this-binding-issue
    private renderToolbarPanel() {
        const moveUp = () => this.moveCellUp(this.state.selectedCell);
        const moveDown = () => this.moveCellDown(this.state.selectedCell);
        const canMoveUp = this.stateController.canMoveUp(this.state.selectedCell);
        const canMoveDown = this.stateController.canMoveDown(this.state.selectedCell);

        return (
            <div id='toolbar-panel'>
                <div className='toolbar-menu-bar'>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={this.stateController.clearAll} tooltip={getLocString('DataScience.clearAll', 'Remove all cells')}>
                        <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Cancel} />
                    </ImageButton>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={this.stateController.redo} disabled={!this.stateController.canRedo()} tooltip={getLocString('DataScience.redo', 'Redo')}>
                        <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Redo} />
                    </ImageButton>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={this.stateController.undo} disabled={!this.stateController.canUndo()} tooltip={getLocString('DataScience.undo', 'Undo')}>
                        <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Undo} />
                    </ImageButton>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={this.stateController.interruptKernel} tooltip={getLocString('DataScience.interruptKernel', 'Interrupt IPython kernel')}>
                        <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Interrupt} />
                    </ImageButton>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={this.stateController.restartKernel} tooltip={getLocString('DataScience.restartServer', 'Restart IPython kernel')}>
                        <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Restart} />
                    </ImageButton>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={this.stateController.save} disabled={!this.state.dirty} tooltip={getLocString('DataScience.save', 'Save File')}>
                        <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.SaveAs} />
                    </ImageButton>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={moveUp} disabled={!canMoveUp} tooltip={getLocString('DataScience.moveSelectedCellUp', 'Move selected cell up')}>
                            <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Up} />
                    </ImageButton>
                    <ImageButton baseTheme={this.props.baseTheme} onClick={moveDown} disabled={!canMoveDown} tooltip={getLocString('DataScience.moveSelectedCellDown', 'Move selected cell down')}>
                            <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Down} />
                    </ImageButton>
                    {this.renderCellType()}
                </div>
                <div className='toolbar-extra-button'>
                <Button onClick={this.stateController.export} disabled={!this.stateController.canExport()} className='toolbar-panel-button' tooltip={getLocString('DataScience.exportAsPythonFileTooltip', 'Export code')}>
                        <span>{getLocString('DataScience.exportAsPythonFileTitle', 'Export')}</span>
                    </Button>
                </div>
            </div>
        );
    }

    private renderCellType() {
        const selectedCell = this.stateController.findCell(this.state.selectedCell);
        if (selectedCell) {
            return (
                <select id='cell_type' aria-label='combobox' role='combobox' aria-expanded='false' aria-controls='' value={selectedCell.cell.data.cell_type} onChange={this.codeTypeChanged} className='cell-state-selector'>
                        <option key={0} aria-selected='false' value='code'>{getLocString('DataScience.codeCell', 'Code')}</option>,
                        <option key={1} aria-selected='false' value='markdown'>{getLocString('DataScience.markdownCell', 'Markdown')}</option>
                </select>
            );
        }

        return null;
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
        return <ContentPanel {...contentProps} ref={this.contentPanelRef}/>;
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
            skipNextScroll: this.state.skipNextScroll ? true : false,
            skipAutoScroll: true,
            monacoTheme: this.state.monacoTheme,
            onCodeCreated: this.stateController.readOnlyCodeCreated,
            onCodeChange: this.stateController.codeChange,
            openLink: this.stateController.openLink,
            expandImage: this.stateController.showPlot,
            editable: true,
            newCellVM: this.state.editCellVM,
            editExecutionCount: ' ', // Always a space for native. It's what Jupyter does.
            editorMeasureClassName: 'measure-editor-div',
            keyDownCell: this.keyDownCell,
            selectedCell: this.state.selectedCell,
            focusedCell: this.state.focusedCell,
            clickCell: this.clickCell,
            doubleClickCell: this.doubleClickCell,
            focusCell: this.stateController.codeGotFocus,
            unfocusCell: this.stateController.codeLostFocus,
            allowsMarkdownEditing: true,
            renderCellToolbar: this.renderCellToolbar
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

    private getNonMessageCells(): ICell[] {
        return this.state.cellVMs.map(cvm => cvm.cell).filter(c => c.data.cell_type !== 'messages');
    }

    private findCellViewModel(cellId: string): ICellViewModel | undefined {
        let result = this.state.cellVMs.find(c => c.cell.id === cellId);
        if (!result) {
            result = cellId === Identifiers.EditCellId ? this.state.editCellVM : undefined;
        }
        return result;
    }

    // tslint:disable-next-line: cyclomatic-complexity
    private keyDownCell = (cellId: string, e: IKeyboardEvent) => {
        switch (e.code) {
            case 'ArrowUp':
                if (this.state.focusedCell === cellId && e.editorInfo && e.editorInfo.isFirstLine && !e.editorInfo.isSuggesting) {
                    this.arrowUpFromCell(cellId, e);
                } else if (!this.state.focusedCell) {
                    this.arrowUpFromCell(cellId, e);
                }
                break;

            case 'ArrowDown':
                if (this.state.focusedCell === cellId && e.editorInfo && e.editorInfo.isLastLine && !e.editorInfo.isSuggesting) {
                    this.arrowDownFromCell(cellId, e);
                } else if (!this.state.focusedCell) {
                    this.arrowDownFromCell(cellId, e);
                }
                break;

            case 'Escape':
                if (this.state.focusedCell && e.editorInfo && !e.editorInfo.isSuggesting) {
                    this.escapeCell(this.state.focusedCell, e);
                }
                break;

            case 'y':
                if (!this.state.focusedCell && this.state.selectedCell) {
                    e.stopPropagation();
                    this.stateController.changeCellType(this.state.selectedCell, 'code');
                }
                break;

            case 'm':
                if (!this.state.focusedCell && this.state.selectedCell) {
                    e.stopPropagation();
                    this.stateController.changeCellType(this.state.selectedCell, 'markdown');
                }
                break;

            case 'Enter':
                if (e.shiftKey) {
                    this.submitCell(cellId, e);
                } else {
                    this.enterCell(cellId, e);
                }
                break;

            default:
                break;
        }
    }

    private enterCell = (cellId: string, e: IKeyboardEvent) => {
        // If focused, then ignore this call. It should go to the focused cell instead.
        if (!this.state.focusedCell && !e.editorInfo && this.contentPanelRef && this.contentPanelRef.current) {
            e.stopPropagation();

            // Figure out which cell this is
            const cellvm = this.stateController.findCell(cellId);
            if (cellvm && this.state.selectedCell === cellId) {
                this.contentPanelRef.current.focusCell(cellId, true);
            }
        }
    }

    private submitCell = (cellId: string, e: IKeyboardEvent) => {
        if (e.editorInfo && e.editorInfo.contents) {
            // Prevent shift+enter from turning into a enter
            e.stopPropagation();
            e.preventDefault();

            // Remove empty lines off the end
            let endPos = e.editorInfo.contents.length - 1;
            while (endPos >= 0 && e.editorInfo.contents[endPos] === '\n') {
                endPos -= 1;
            }
            const content = e.editorInfo.contents.slice(0, endPos + 1);

            // Clear our current contents since we submitted if this is the edit cell
            if (e.shouldClear && cellId === Identifiers.EditCellId) {
                e.shouldClear();
            }

            // Send to jupyter
            const cellVM = this.findCellViewModel(cellId);
            if (cellVM && cellVM.cell.data.cell_type === 'code') {
                this.submitInput(content, cellVM);
            } else if (cellVM && cellVM.cell.data.cell_type === 'markdown') {
                // If a markdown cell, force focus loss (or the same thing as hitting escape).
                // Focus loss should cause a submit.
                this.escapeCell(cellId, e);
            }
        }
    }

    private arrowUpFromCell = (cellId: string, e: IKeyboardEvent) => {
        const cells = this.getNonMessageCells();

        // Find the previous cell index
        let index = cells.findIndex(c => c.id === cellId) - 1;

        // Might also be the edit cell
        if (this.state.editCellVM && cellId === this.state.editCellVM.cell.id) {
            index = cells.length - 1;
        }

        if (index >= 0 && this.contentPanelRef.current) {
            e.stopPropagation();
            const prevCellId = cells[index].id;
            const wasFocused = this.state.focusedCell;
            this.stateController.selectCell(prevCellId, wasFocused ? prevCellId : undefined);
            this.contentPanelRef.current.focusCell(prevCellId, wasFocused ? true : false);
        }
    }

    private arrowDownFromCell = (cellId: string, e: IKeyboardEvent) => {
        const cells = this.getNonMessageCells();

        // Find the next cell to move to
        const index = cells.findIndex(c => c.id === cellId);
        let nextCellId: string | undefined;
        if (index >= 0) {
            if (index < cells.length - 1) {
                nextCellId = cells[index + 1].id;
            } else if (this.state.editCellVM) {
                nextCellId = this.state.editCellVM.cell.id;
            }
        }

        if (nextCellId && this.contentPanelRef.current) {
            e.stopPropagation();
            const wasFocused = this.state.focusedCell;
            this.stateController.selectCell(nextCellId, wasFocused ? nextCellId : undefined);
            this.contentPanelRef.current.focusCell(nextCellId, wasFocused ? true : false);
        }
    }

    private clickCell = (cellId: string) => {
        const focusedCell = cellId === this.state.focusedCell ? cellId : undefined;
        this.stateController.selectCell(cellId, focusedCell);
    }

    private doubleClickCell = (cellId: string) => {
        if (this.contentPanelRef.current) {
            this.contentPanelRef.current.focusCell(cellId, true);
        }
    }

    private escapeCell = (cellId: string, e: IKeyboardEvent) => {
        // Unfocus the current cell by giving focus to the cell itself
        if (this.contentPanelRef && this.contentPanelRef.current) {
            e.stopPropagation();
            this.contentPanelRef.current.focusCell(cellId, false);
        }

    }

    private submitInput = (code: string, inputCell: ICellViewModel) => {
        // Send to the state controller
        this.stateController.submitInput(code, inputCell);

        // After that's done, make sure the cell is scrolled to
        setTimeout(() => {
            if (this.contentPanelRef && this.contentPanelRef.current) {
                this.contentPanelRef.current.focusCell(inputCell.cell.id, true);
            }
        }, 10);
    }

    private codeTypeChanged = (event: React.SyntheticEvent<HTMLSelectElement>) => {
        if (this.state.selectedCell && event.currentTarget.value) {
            const value = event.currentTarget.value === 'code' ? 'code' : 'markdown';
            this.stateController.changeCellType(this.state.selectedCell, value);

            // If this cell is the last cell, immediately give it focus
            if (this.state.selectedCell === Identifiers.EditCellId && this.contentPanelRef.current) {
                this.contentPanelRef.current.focusCell(this.state.selectedCell, true);
            }
        }
    }

    // private copyToClipboard = (cellId: string) => {
    //     const cell = this.stateController.findCell(cellId);
    //     if (cell) {
    //         // Need to do this in this process so it copies to the user's clipboard and not
    //         // the remote clipboard where the extension is running
    //         const textArea = document.createElement('textarea');
    //         textArea.value = concatMultilineString(cell.cell.data.source);
    //         document.body.appendChild(textArea);
    //         textArea.select();
    //         document.execCommand('Copy');
    //         textArea.remove();
    //     }
    // }

    private moveCellUp = (cellId?: string) => {
        if (this.contentPanelRef.current && cellId) {
            const wasFocused = this.state.focusedCell;
            this.stateController.moveCellUp(cellId);
            this.contentPanelRef.current.focusCell(cellId, wasFocused ? true : false);
        }
    }

    private moveCellDown = (cellId?: string) => {
        if (this.contentPanelRef.current && cellId) {
            const wasFocused = this.state.focusedCell;
            this.stateController.moveCellDown(cellId);
            this.contentPanelRef.current.focusCell(cellId, wasFocused ? true : false);
        }
    }

    private renderCellToolbar = (cellId: string): JSX.Element[] | null => {
        if (cellId !== Identifiers.EditCellId) {
            const cell = this.state.cellVMs.find(cvm => cvm.cell.id === cellId);
            if (cell) {
                const deleteCell = () => this.stateController.deleteCell(cellId);
                const runCell = () => {
                    this.stateController.updateCellSource(cellId);
                    this.stateController.submitInput(concatMultilineString(cell.cell.data.source), cell);
                };
                const moveUp = () => this.moveCellUp(cellId);
                const moveDown = () => this.moveCellDown(cellId);
                const canMoveUp = this.stateController.canMoveUp(cellId);
                const canMoveDown = this.stateController.canMoveDown(cellId);

                const outerPortion =
                    <div className='native-editor-celltoolbar-outer' key={0}>
                        <ImageButton baseTheme={this.props.baseTheme} onClick={moveUp} disabled={!canMoveUp} tooltip={getLocString('DataScience.moveCellUp', 'Move cell up')}>
                            <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Up} />
                        </ImageButton>
                        <ImageButton baseTheme={this.props.baseTheme} onClick={deleteCell} tooltip={getLocString('DataScience.deleteCell', 'Delete cell')}>
                            <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Cancel} />
                        </ImageButton>
                        <ImageButton baseTheme={this.props.baseTheme} onClick={moveDown} disabled={!canMoveDown} tooltip={getLocString('DataScience.moveCellDown', 'Move cell down')}>
                            <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Down} />
                        </ImageButton>
                    </div>;

                const innerPortion =
                    <div className='native-editor-celltoolbar-inner' key={1}>
                        <ImageButton baseTheme={this.props.baseTheme} onClick={runCell} tooltip={getLocString('DataScience.runCell', 'Run cell')}>
                            <Image baseTheme={this.props.baseTheme} class='image-button-image' image={ImageName.Run} />
                        </ImageButton>
                    </div>;

                if (cell.cell.data.cell_type === 'code') {
                    return [innerPortion, outerPortion];
                }

                return [outerPortion];
            }
        }

        return null;
    }

}
