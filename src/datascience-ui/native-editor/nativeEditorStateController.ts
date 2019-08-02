// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

import { InteractiveWindowMessages } from '../../client/datascience/interactive-common/interactiveWindowTypes';
import { ICellViewModel } from '../interactive-common/cell';
import { IMainStateControllerProps, MainStateController } from '../interactive-common/mainStateController';

export class NativeEditorStateController extends MainStateController {
    // tslint:disable-next-line:max-func-body-length
    constructor(props: IMainStateControllerProps) {
        super(props);
    }

    // tslint:disable-next-line: no-any
    public handleMessage(msg: string, payload?: any) {
        const result = super.handleMessage(msg, payload);

        switch (msg) {
            case InteractiveWindowMessages.LoadAllCells:
                // Stop being busy as we've loaded our first set of cells.
                this.stopBusy();
                break;

            case InteractiveWindowMessages.NotebookDirty:
                // Indicate dirty
                this.setState({ dirty: true });
                break;

            default:
                break;
        }

        return result;
    }

    public canSave(): boolean {
        return this.getState().dirty ? true : false;
    }

    // Adjust the visibility or collapsed state of a cell
    protected alterCellVM(cellVM: ICellViewModel, _visible: boolean, _expanded: boolean): ICellViewModel {
        // cells are always editable
        cellVM.editable = true;
        return cellVM;
    }

    protected onCodeLostFocus(cellId: string) {
        // See if this is a markdown cell. We need to update the cell's source based on the contents of the editor being used
        const cell = this.findCell(cellId);
        if (cell && cell.cell.data.cell_type === 'markdown') {
            // Get the model for the monaco editor
            const monacoId = this.getMonacoId(cellId);
            if (monacoId) {
                const model = monacoEditor.editor.getModels().find(m => m.id === monacoId);
                if (model) {
                    const newValue = model.getValue().replace(/\r/g, '');
                    this.submitInput(newValue, cell);
                }
            }
        }
    }
}
