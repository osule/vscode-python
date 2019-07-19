// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import '../../common/extensions';

import { nbformat } from '@jupyterlab/coreutils';
import { inject, injectable, multiInject } from 'inversify';
import * as uuid from 'uuid/v4';
import { Event, EventEmitter, TextEditor } from 'vscode';

import {
    IApplicationShell,
    ICommandManager,
    IDocumentManager,
    ILiveShareApi,
    IWebPanelProvider,
    IWorkspaceService
} from '../../common/application/types';
import { IFileSystem } from '../../common/platform/types';
import { IConfigurationService, IDisposableRegistry, ILogger } from '../../common/types';
import * as localize from '../../common/utils/localize';
import { IInterpreterService } from '../../interpreter/contracts';
import { captureTelemetry } from '../../telemetry';
import { Identifiers, Telemetry } from '../constants';
import { InteractiveBase } from '../interactive-common/interactiveBase';
import { InteractiveWindowMessages, ISubmitNewCell } from '../interactive-common/interactiveWindowTypes';
import {
    CellState,
    ICell,
    ICodeCssGenerator,
    IDataViewerProvider,
    IInteractiveWindow,
    IInteractiveWindowListener,
    IInteractiveWindowProvider,
    IJupyterDebugger,
    IJupyterExecution,
    IJupyterVariables,
    INotebookExporter,
    INotebookImporter,
    INotebookServerOptions,
    IStatusProvider,
    IThemeFinder
} from '../types';

@injectable()
export class InteractiveWindow extends InteractiveBase implements IInteractiveWindow {
    private closedEvent: EventEmitter<IInteractiveWindow> = new EventEmitter<IInteractiveWindow>();

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
        @inject(ICommandManager) commandManager: ICommandManager,
        @inject(INotebookExporter) jupyterExporter: INotebookExporter,
        @inject(IWorkspaceService) workspaceService: IWorkspaceService,
        @inject(IInteractiveWindowProvider) private interactiveWindowProvider: IInteractiveWindowProvider,
        @inject(IDataViewerProvider) dataExplorerProvider: IDataViewerProvider,
        @inject(IJupyterVariables) jupyterVariables: IJupyterVariables,
        @inject(INotebookImporter) private jupyterImporter: INotebookImporter,
        @inject(IJupyterDebugger) jupyterDebugger: IJupyterDebugger
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
            commandManager,
            jupyterExporter,
            workspaceService,
            dataExplorerProvider,
            jupyterVariables,
            jupyterDebugger);
    }

    public dispose() {
        super.dispose();
        if (this.closedEvent) {
            this.closedEvent.fire(this);
        }
    }

    public get closed(): Event<IInteractiveWindow> {
        return this.closedEvent.event;
    }

    public addMessage(message: string): Promise<void> {
        this.addMessageImpl(message, 'execute');
        return Promise.resolve();
    }

    public addCode(code: string, file: string, line: number, editor?: TextEditor): Promise<boolean> {
        // Call the internal method.
        return this.submitCode(code, file, line, undefined, editor, false);
    }

    public debugCode(code: string, file: string, line: number, editor?: TextEditor): Promise<boolean> {
        // Call the internal method.
        return this.submitCode(code, file, line, undefined, editor, true);
    }

    public async previewNotebook(file: string): Promise<void> {
        try {
            // First convert to a python file to verify this file is valid. This is
            // an easy way to have something else verify the validity of the file.
            const results = await this.jupyterImporter.importFromFile(file);
            if (results) {
                // Show our webpanel to make sure that the code actually shows up. (Vscode disables the webview when it's not active)
                await this.show();

                // Then read in the file as json. This json should already
                // be in the cell format
                // tslint:disable-next-line: no-any
                const contents = JSON.parse(await this.fileSystem.readFile(file)) as any;
                if (contents && contents.cells && contents.cells.length) {
                    // Add a header before the preview
                    this.addPreviewHeader(file);

                    // Convert the cells into actual cell objects
                    const cells = contents.cells as (nbformat.ICodeCell | nbformat.IRawCell | nbformat.IMarkdownCell)[];

                    // Convert the inputdata into our ICell format
                    const finishedCells: ICell[] = cells.filter(c => c.source.length > 0).map(c => {
                        return {
                            id: uuid(),
                            file: Identifiers.EmptyFileName,
                            line: 0,
                            state: CellState.finished,
                            data: c,
                            type: 'preview'
                        };
                    });

                    // Do the same thing that happens when new code is added.
                    this.sendCellsToWebView(finishedCells);

                    // Add a footer after the preview
                    this.addPreviewFooter(file);
                }
            }
        } catch (e) {
            this.applicationShell.showErrorMessage(e);
        }
    }

    @captureTelemetry(Telemetry.ExpandAll)
    public expandAllCells() {
        this.postMessage(InteractiveWindowMessages.ExpandAll).ignoreErrors();
    }

    @captureTelemetry(Telemetry.CollapseAll)
    public collapseAllCells() {
        this.postMessage(InteractiveWindowMessages.CollapseAll).ignoreErrors();
    }

    @captureTelemetry(Telemetry.SubmitCellThroughInput, undefined, false)
    // tslint:disable-next-line:no-any
    protected submitNewCell(info: ISubmitNewCell) {
        // If there's any payload, it has the code and the id
        if (info && info.code && info.id) {
            // Send to ourselves.
            this.submitCode(info.code, Identifiers.EmptyFileName, 0, info.id, undefined).ignoreErrors();

            // Activate the other side, and send as if came from a file
            this.interactiveWindowProvider.getOrCreateActive().then(_v => {
                this.shareMessage(InteractiveWindowMessages.RemoteAddCode, { code: info.code, file: Identifiers.EmptyFileName, line: 0, id: info.id, originator: this.id, debug: false });
            }).ignoreErrors();
        }
    }

    protected getNotebookOptions(): Promise<INotebookServerOptions> {
        return this.interactiveWindowProvider.getNotebookOptions();
    }
    private addPreviewHeader(file: string): void {
        const message = localize.DataScience.previewHeader().format(file);
        this.addMessageImpl(message, 'preview');
    }

    private addPreviewFooter(file: string): void {
        const message = localize.DataScience.previewFooter().format(file);
        this.addMessageImpl(message, 'preview');
    }

}
