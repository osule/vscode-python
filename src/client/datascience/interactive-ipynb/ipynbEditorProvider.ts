// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { inject, injectable } from 'inversify';
import * as uuid from 'uuid/v4';
import { Disposable, Event, EventEmitter, Uri } from 'vscode';
import * as vsls from 'vsls/vscode';

import { ILiveShareApi } from '../../common/application/types';
import { IAsyncDisposable, IAsyncDisposableRegistry, IConfigurationService, IDisposableRegistry } from '../../common/types';
import { createDeferred, Deferred, waitForPromise } from '../../common/utils/async';
import * as localize from '../../common/utils/localize';
import { IServiceContainer } from '../../ioc/types';
import { Identifiers, LiveShare, LiveShareCommands, Settings } from '../constants';
import { PostOffice } from '../liveshare/postOffice';
import { IInteractiveWindow, IInteractiveWindowProvider, INotebookServerOptions, INotebookEditorProvider, INotebookEditor } from '../types';
import { string } from 'prop-types';
import { IFileSystem } from '../../common/platform/types';


@injectable()
export class IpynbProvider implements INotebookEditorProvider, IAsyncDisposable {
    private id: string = uuid();
    private postOffice: PostOffice;
    private activeEditors: Map<string, INotebookEditor> = new Map<string, INotebookEditor>();
    private pendingContents: Map<string, Deferred<string>> = new Map<string, Deferred<string>>();
    constructor(
        @inject(ILiveShareApi) liveShare: ILiveShareApi,
        @inject(IServiceContainer) private serviceContainer: IServiceContainer,
        @inject(IAsyncDisposableRegistry) asyncRegistry: IAsyncDisposableRegistry,
        @inject(IDisposableRegistry) private disposables: IDisposableRegistry,
        @inject(IFileSystem) private fileSystem: IFileSystem
    ) {
        asyncRegistry.push(this);

        // Create a post office so we can make sure interactive windows are created at the same time
        // on both sides.
        this.postOffice = new PostOffice(LiveShare.NotebookEditorProviderService, liveShare);

        // Listen for messages so we force a create on both sides.
        this.postOffice.registerCallback(LiveShareCommands.editorLoadContents, this.onLoadedContents, this).ignoreErrors();
    }

    public dispose(): Promise<void> {
        return this.postOffice.dispose();
    }

    public async open(file: Uri): Promise<INotebookEditor> {
        // See if this file is open or not already
        let editor = this.activeEditors.get(file.fsPath);
        if (!editor) {
            editor = await this.create(file);
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

    private async loadContents(file: Uri): Promise<string | null> {
        if (this.postOffice.role !== vsls.Role.Guest) {
            const contents = await this.fileSystem.readFile(file.fsPath);
            this.postOffice.postCommand(LiveShareCommands.editorLoadContents, file, contents).ignoreErrors();
            return contents;
        } else {
            if (!this.pendingContents.get(file.fsPath)) {
                this.pendingContents.set(file.fsPath, createDeferred<string>());
                this.postOffice.postCommand(LiveShareCommands.editorLoadContents, file).ignoreErrors();
            }
            return waitForPromise(this.pendingContents.get(file.fsPath)!.promise, 2000);
        }
    }

    // tslint:disable-next-line: no-any
    private onLoadedContents(...args: any[]): void {
        // Ignore this from ourselves
        if (args.length > 1 && args[0] !== this.id) {
            // On the host side, broadcast the contents of the file
            if (this.postOffice.role !== vsls.Role.Guest) {
                this.loadContents(args[1]).ignoreErrors();
            } else {
                // On the guest side, the contents should be in the message
                const uri = args[1] as Uri;
                const pending = this.pendingContents.get(uri.fsPath);
                if (pending && args.length > 2) {
                    pending.resolve(args[2]);
                }
            }
        }
    }

    private async create(file: Uri): Promise<INotebookEditor> {
        // First read the contents. Might not be able to
        const contents = await this.loadContents(file);
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
