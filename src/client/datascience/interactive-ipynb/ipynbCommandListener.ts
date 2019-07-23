// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import '../../common/extensions';

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { TextDocument } from 'vscode';

import { ICommandManager, IDocumentManager } from '../../common/application/types';
import { IDisposableRegistry } from '../../common/types';
import { Commands } from '../constants';
import { IDataScienceCommandListener, IDataScienceErrorHandler, INotebookEditorProvider } from '../types';

@injectable()
export class IpynbCommandListener implements IDataScienceCommandListener {
    constructor(
        @inject(IDisposableRegistry) private disposableRegistry: IDisposableRegistry,
        @inject(INotebookEditorProvider) private provider: INotebookEditorProvider,
        @inject(IDocumentManager) private documentManager: IDocumentManager,
        @inject(ICommandManager) private readonly cmdManager: ICommandManager,
        @inject(IDataScienceErrorHandler) private dataScienceErrorHandler: IDataScienceErrorHandler
    ) {
        // Listen to document open commands. We use this to launch an ipynb editor
        const disposable = this.documentManager.onDidOpenTextDocument(this.onOpenedDocument);
        this.disposableRegistry.push(disposable);

        // Since we may have activated after a document was opened, also run open document for all documents
        this.documentManager.textDocuments.forEach(this.onOpenedDocument);
    }

    public register(commandManager: ICommandManager): void {
        this.disposableRegistry.push(commandManager.registerCommand(Commands.NotebookEditorUndoCells, () => this.undoCells()));
        this.disposableRegistry.push(commandManager.registerCommand(Commands.NotebookEditorRedoCells, () => this.redoCells()));
        this.disposableRegistry.push(commandManager.registerCommand(Commands.NotebookEditorRemoveAllCells, () => this.removeAllCells()));
        this.disposableRegistry.push(commandManager.registerCommand(Commands.NotebookEditorInterruptKernel, () => this.interruptKernel()));
        this.disposableRegistry.push(commandManager.registerCommand(Commands.NotebookEditorRestartKernel, () => this.restartKernel()));
    }

    private undoCells() {
        const activeEditor = this.provider.activeEditor;
        if (activeEditor) {
            activeEditor.undoCells();
        }
    }

    private redoCells() {
        const activeEditor = this.provider.activeEditor;
        if (activeEditor) {
            activeEditor.redoCells();
        }
    }

    private removeAllCells() {
        const activeEditor = this.provider.activeEditor;
        if (activeEditor) {
            activeEditor.removeAllCells();
        }
    }

    private interruptKernel() {
        const activeEditor = this.provider.activeEditor;
        if (activeEditor) {
            activeEditor.interruptKernel().ignoreErrors();
        }
    }

    private restartKernel() {
        const activeEditor = this.provider.activeEditor;
        if (activeEditor) {
            activeEditor.restartKernel().ignoreErrors();
        }
    }

    private onOpenedDocument = async (document: TextDocument) => {
        // See if this is an ipynb file
        if (path.extname(document.fileName).toLocaleLowerCase() === '.ipynb') {
            try {
                const contents = document.getText();
                const uri = document.uri;

                // Close this document. This is a big hack as there's no way to register
                // ourselves as an editor for ipynb
                const command = 'workbench.action.closeActiveEditor';
                await this.cmdManager.executeCommand(command);

                // Then take the contents and load it.
                return this.provider.open(uri, contents);

            } catch (e) {
                this.dataScienceErrorHandler.handleError(e);
            }
        }
    }

}
