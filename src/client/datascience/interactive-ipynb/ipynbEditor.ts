// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import '../../common/extensions';

import { inject, injectable, multiInject } from 'inversify';
import * as path from 'path';
import { Event, EventEmitter, Uri, ViewColumn } from 'vscode';

import {
    IApplicationShell,
    ICommandManager,
    IDocumentManager,
    ILiveShareApi,
    IWebPanelProvider,
    IWorkspaceService
} from '../../common/application/types';
import { ContextKey } from '../../common/contextKey';
import { IFileSystem } from '../../common/platform/types';
import { IConfigurationService, IDisposableRegistry, ILogger } from '../../common/types';
import { createDeferred, Deferred } from '../../common/utils/async';
import * as localize from '../../common/utils/localize';
import { EXTENSION_ROOT_DIR } from '../../constants';
import { IInterpreterService } from '../../interpreter/contracts';
import { captureTelemetry } from '../../telemetry';
import { EditorContexts, Identifiers, Settings, Telemetry } from '../constants';
import { InteractiveBase } from '../interactive-common/interactiveBase';
import { InteractiveWindowMessages, ISubmitNewCell } from '../interactive-common/interactiveWindowTypes';
import { dirtyNotebookDialogTitle } from '../../common/utils/localize';
import {
    ICell,
    ICodeCssGenerator,
    IDataViewerProvider,
    IInteractiveWindowInfo,
    IInteractiveWindowListener,
    IJupyterDebugger,
    IJupyterExecution,
    IJupyterVariables,
    INotebookEditor,
    INotebookEditorProvider,
    INotebookExporter,
    INotebookImporter,
    INotebookServerOptions,
    IStatusProvider,
    IThemeFinder
} from '../types';

@injectable()
export class IpynbEditor extends InteractiveBase implements INotebookEditor {
    private closedEvent: EventEmitter<INotebookEditor> = new EventEmitter<INotebookEditor>();
    private loadedPromise: Deferred<void> = createDeferred<void>();
    private _file: Uri = Uri.file('');
    private _dirty: boolean = false;
    private visibleCells: ICell[] = [];

    constructor(
        @multiInject(IInteractiveWindowListener) listeners: IInteractiveWindowListener[],
        @inject(ILiveShareApi) liveShare: ILiveShareApi,
        @inject(IApplicationShell) applicationShell: IApplicationShell,
        @inject(IDocumentManager) documentManager: IDocumentManager,
        @inject(IInterpreterService) interpreterService: IInterpreterService,
        @inject(IWebPanelProvider) provider: IWebPanelProvider,
        @inject(IDisposableRegistry) disposables: IDisposableRegistry,
        @inject(ICodeCssGenerator) cssGenerator: ICodeCssGenerator,
        @inject(IThemeFinder) themeFinder: IThemeFinder,
        @inject(ILogger) logger: ILogger,
        @inject(IStatusProvider) statusProvider: IStatusProvider,
        @inject(IJupyterExecution) jupyterExecution: IJupyterExecution,
        @inject(IFileSystem) fileSystem: IFileSystem,
        @inject(IConfigurationService) configuration: IConfigurationService,
        @inject(ICommandManager) private commandManager: ICommandManager,
        @inject(INotebookExporter) jupyterExporter: INotebookExporter,
        @inject(IWorkspaceService) workspaceService: IWorkspaceService,
        @inject(INotebookEditorProvider) private editorProvider: INotebookEditorProvider,
        @inject(IDataViewerProvider) dataExplorerProvider: IDataViewerProvider,
        @inject(IJupyterVariables) jupyterVariables: IJupyterVariables,
        @inject(IJupyterDebugger) jupyterDebugger: IJupyterDebugger,
        @inject(INotebookImporter) private importer: INotebookImporter
    ) {
        super(
            listeners,
            liveShare,
            applicationShell,
            documentManager,
            interpreterService,
            provider,
            disposables,
            cssGenerator,
            themeFinder,
            logger,
            statusProvider,
            jupyterExecution,
            fileSystem,
            configuration,
            jupyterExporter,
            workspaceService,
            dataExplorerProvider,
            jupyterVariables,
            jupyterDebugger,
            path.join(EXTENSION_ROOT_DIR, 'out', 'datascience-ui', 'native-editor', 'index_bundle.js'),
            localize.DataScience.nativeEditorTitle(),
            ViewColumn.Active);

    }

    public get visible(): boolean {
        return this.viewState.visible;
    }

    public get active(): boolean {
        return this.viewState.active;
    }

    public get file(): Uri {
        return this._file;
    }

    public dispose(): void {
        super.dispose();

        // Ask user if they want to save if hotExit is not enabled.
        if (this._dirty) {
            const files = this.workspaceService.getConfiguration('files', undefined);
            const hotExit = files ? files.get('hotExit') : 'off';
            if (hotExit === 'off') {
                const message1 = localize.DataScience.dirtyNotebookMessage1().format(`${path.basename(this.file.fsPath)}`);
                const message2 = localize.DataScience.dirtyNotebookMessage2();
                const yes = localize.DataScience.dirtyNotebookYes();
                const no = localize.DataScience.dirtyNotebookNo();
                // tslint:disable-next-line: messages-must-be-localized
                this.applicationShell.showWarningMessage(`${message1}\n${message2}`, yes, no).then(v => {
                    if (v === yes) {
                        this.saveContents().ignoreErrors();
                    }
                });
            }
        }
        if (this.closedEvent) {
            this.closedEvent.fire(this);
        }
    }

    public async load(content: string, file: Uri): Promise<void> {
        // Save our uri
        this._file = file;

        // Indicate we have our identity
        this.loadedPromise.resolve();

        // Update our title to match
        this.setTitle(path.basename(file.fsPath));

        // Load the contents of this notebook into our cells.
        const cells = content ? await this.importer.importCells(content) : [];

        // If that works, send the cells to the web view
        return this.postMessage(InteractiveWindowMessages.LoadAllCells, { cells });
    }

    public get closed(): Event<INotebookEditor> {
        return this.closedEvent.event;
    }

    @captureTelemetry(Telemetry.SubmitCellThroughInput, undefined, false)
    // tslint:disable-next-line:no-any
    protected submitNewCell(info: ISubmitNewCell) {
        // If there's any payload, it has the code and the id
        if (info && info.code && info.id) {
            // Update dirtiness
            this.setDirty();

            // Send to ourselves.
            this.submitCode(info.code, Identifiers.EmptyFileName, 0, info.id).ignoreErrors();

            // Activate the other side, and send as if came from a file
            this.editorProvider.show(this.file).then(_v => {
                this.shareMessage(InteractiveWindowMessages.RemoteAddCode, { code: info.code, file: Identifiers.EmptyFileName, line: 0, id: info.id, originator: this.id, debug: false });
            }).ignoreErrors();
        }
    }

    @captureTelemetry(Telemetry.ExecuteNativeCell, undefined, false)
    // tslint:disable-next-line:no-any
    protected reexecuteCell(info: ISubmitNewCell) {
        // If there's any payload, it has the code and the id
        if (info && info.code && info.id) {
            // Update dirtiness
            this.setDirty();

            // Clear the result if we've run before
            this.clearResult(info.id);

            // Send to ourselves.
            this.submitCode(info.code, Identifiers.EmptyFileName, 0, info.id).ignoreErrors();

            // Activate the other side, and send as if came from a file
            this.editorProvider.show(this.file).then(_v => {
                this.shareMessage(InteractiveWindowMessages.RemoteAddCode, { code: info.code, file: Identifiers.EmptyFileName, line: 0, id: info.id, originator: this.id, debug: false });
            }).ignoreErrors();
        }
    }

    protected async getNotebookOptions(): Promise<INotebookServerOptions> {
        const settings = this.configuration.getSettings();
        let serverURI: string | undefined = settings.datascience.jupyterServerURI;
        const useDefaultConfig: boolean | undefined = settings.datascience.useDefaultConfigForJupyter;

        // For the local case pass in our URI as undefined, that way connect doesn't have to check the setting
        if (serverURI === Settings.JupyterServerLocalLaunch) {
            serverURI = undefined;
        }

        return {
            enableDebugging: true,
            uri: serverURI,
            useDefaultConfig,
            purpose: Identifiers.HistoryPurpose  // Share the same one as the interactive window. Just need a new session
        };
    }

    protected async getNotebookIdentity(): Promise<Uri> {
        await this.loadedPromise.promise;

        // File should be set now
        return this._file;
    }

    protected updateContexts(info: IInteractiveWindowInfo | undefined) {
        // This should be called by the python interactive window every
        // time state changes. We use this opportunity to update our
        // extension contexts
        const interactiveContext = new ContextKey(EditorContexts.HaveNative, this.commandManager);
        interactiveContext.set(!this.isDisposed).catch();
        const interactiveCellsContext = new ContextKey(EditorContexts.HaveNativeCells, this.commandManager);
        const redoableContext = new ContextKey(EditorContexts.HaveNativeRedoableCells, this.commandManager);
        if (info) {
            interactiveCellsContext.set(info.cellCount > 0).catch();
            redoableContext.set(info.redoCount > 0).catch();
        } else {
            interactiveCellsContext.set(false).catch();
            redoableContext.set(false).catch();
        }

        // Also keep track of our visible cells. We use this to save to the file when we close
        this.visibleCells = info ? info.visibleCells : [];
    }

    protected async onViewStateChanged(visible: boolean, active: boolean) {
        await super.onViewStateChanged(visible, active);

        // Update our contexts
        const interactiveContext = new ContextKey(EditorContexts.HaveNative, this.commandManager);
        interactiveContext.set(visible && active).catch();
    }

    private setDirty(): void {
        if (!this._dirty) {
            this._dirty = true;
            this.setTitle(`${path.basename(this.file.fsPath)}*`);
            this.postMessage(InteractiveWindowMessages.NotebookDirty).ignoreErrors();
        }
    }

    private async saveContents(): Promise<void> {
        let fileToSaveTo: Uri | undefined = this.file;

        // Ask user for a save as dialog if no title
        const baseName = path.basename(this.file.fsPath);
        if (baseName.includes(localize.DataScience.untitledNotebookFileName())) {
            const filtersKey = localize.DataScience.dirtyNotebookDialogFilter();
            const filtersObject: { [name: string]: string[] } = {};
            filtersObject[filtersKey] = ['ipynb'];

            fileToSaveTo = await this.applicationShell.showSaveDialog({
                saveLabel: localize.DataScience.dirtyNotebookDialogTitle(),
                filters: filtersObject
            });
        }

        if (fileToSaveTo) {
            let directoryChange;
            const settings = this.configuration.getSettings();
            if (settings.datascience.changeDirOnImportExport) {
                directoryChange = fileToSaveTo.fsPath;
            }

            // Save our visible cells into the file
            const notebook = await this.jupyterExporter.translateToNotebook(this.visibleCells, directoryChange);
            await this.fileSystem.writeFile(fileToSaveTo.fsPath, JSON.stringify(notebook));
        }
    }
}
