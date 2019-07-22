// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';

import { IAsyncDisposable, IAsyncDisposableRegistry, IDisposableRegistry } from '../../common/types';
import * as localize from '../../common/utils/localize';
import { IServiceContainer } from '../../ioc/types';
import { INotebookEditor, INotebookEditorProvider } from '../types';

@injectable()
export class IpynbProvider implements INotebookEditorProvider, IAsyncDisposable {
    private activeEditors: Map<string, INotebookEditor> = new Map<string, INotebookEditor>();
    constructor(
        @inject(IServiceContainer) private serviceContainer: IServiceContainer,
        @inject(IAsyncDisposableRegistry) asyncRegistry: IAsyncDisposableRegistry,
        @inject(IDisposableRegistry) private disposables: IDisposableRegistry
    ) {
        asyncRegistry.push(this);

        // No sync required as open document from vscode will give us our contents.
    }

    public dispose(): Promise<void> {
        return Promise.resolve();
    }

    public get activeEditor(): INotebookEditor | undefined {
        const active = [...this.activeEditors.entries()].find(e => e[1].active);
        if (active) {
            return active[1];
        }
    }

    public async open(file: Uri, contents: string): Promise<INotebookEditor> {
        // See if this file is open or not already
        let editor = this.activeEditors.get(file.fsPath);
        if (!editor) {
            editor = await this.create(file, contents);
            this.activeEditors.set(file.fsPath, editor);
        }
        return editor;
    }

    public async show(file: Uri): Promise<INotebookEditor | undefined> {
        // See if this file is open or not already
        const editor = this.activeEditors.get(file.fsPath);
        if (editor) {
            await editor.show();
        }
        return editor;
    }

    private async create(file: Uri, contents: string): Promise<INotebookEditor> {
        if (contents) {
            const editor = this.serviceContainer.get<INotebookEditor>(INotebookEditor);
            await editor.load(contents, file);
            this.disposables.push(editor.closed(this.onClosedEditor.bind(this)));
            await editor.show();
            return editor;
        }

        throw new Error(localize.DataScience.liveShareConnectFailure());
    }

    private onClosedEditor(e: INotebookEditor) {
        this.activeEditors.delete(e.file.fsPath);
    }

}
