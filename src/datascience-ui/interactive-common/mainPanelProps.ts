// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

import { IInteractiveWindowMapping } from '../../client/datascience/interactive-common/interactiveWindowTypes';
import { Event } from '../react-common/event';
import { ICellViewModel } from './cell';
import { IMainPanelState } from './mainPanelState';

export interface IMainPanelHOCProps {
    skipDefault?: boolean;
    testMode?: boolean;
    baseTheme: string;
    codeTheme: string;
    hasCollapseableInputs: boolean;
}

export interface IMainPanelProps extends IMainPanelHOCProps {
    value: IMainPanelState;
    activated: Event<void>;
    sendMessage<M extends IInteractiveWindowMapping, T extends keyof M>(type: T, payload?: M[T]): void;
    refreshVariables(): void;
    deleteCell(index: number): void;
    collapseAll(): void;
    expandAll(): void;
    clearAll(): void;
    undo(): void;
    redo(): void;
    submitInput(code: string, inputCell: ICellViewModel): void;
    readOnlyCodeCreated(text: string, file: string, id: string, monacoId: string): void;
    editableCodeCreated(text: string, file: string, id: string, monacoId: string): void;
    codeChange(changes: monacoEditor.editor.IModelContentChange[], id: string, modelId: string): void;
    openLink(uri: monacoEditor.Uri): void;
    gotoCellCode(index: number): void;
    copyCellCode(index: number): void;
    canCollapseAll(): boolean;
    canExpandAll(): boolean;
    canExport(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    export(): void;
    restartKernel(): void;
    interruptKernel(): void;
    showPlot(imageHtml: string): void;
    showDataViewer(targetVariable: string, numberOfColumns: number): void;
    variableExplorerToggled(open: boolean): void;
    stopBusy(): void;
}
