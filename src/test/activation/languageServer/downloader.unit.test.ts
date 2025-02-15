// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// tslint:disable:no-any

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { SemVer } from 'semver';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { Uri, WorkspaceConfiguration } from 'vscode';
import { LanguageServerDownloader } from '../../../client/activation/languageServer/downloader';
import { LanguageServerFolderService } from '../../../client/activation/languageServer/languageServerFolderService';
import { PlatformData } from '../../../client/activation/languageServer/platformData';
import { ILanguageServerFolderService, ILanguageServerOutputChannel, IPlatformData } from '../../../client/activation/types';
import { ApplicationShell } from '../../../client/common/application/applicationShell';
import { IApplicationShell, IWorkspaceService } from '../../../client/common/application/types';
import { WorkspaceService } from '../../../client/common/application/workspace';
import { FileDownloader } from '../../../client/common/net/fileDownloader';
import { FileSystem } from '../../../client/common/platform/fileSystem';
import { IFileSystem } from '../../../client/common/platform/types';
import { IFileDownloader, IOutputChannel, Resource } from '../../../client/common/types';
import { Common, LanguageService } from '../../../client/common/utils/localize';
import { noop } from '../../core';
import { MockOutputChannel } from '../../mockClasses';

use(chaiAsPromised);

// tslint:disable-next-line:max-func-body-length
suite('Activation - Downloader', () => {
    let languageServerDownloader: LanguageServerDownloader;
    let folderService: TypeMoq.IMock<ILanguageServerFolderService>;
    let workspaceService: TypeMoq.IMock<IWorkspaceService>;
    let resource: Resource;
    let outputChannel: IOutputChannel;
    let lsOutputChannel: TypeMoq.IMock<ILanguageServerOutputChannel>;
    setup(() => {
        outputChannel = mock(MockOutputChannel);
        lsOutputChannel = TypeMoq.Mock.ofType<ILanguageServerOutputChannel>();
        lsOutputChannel
            .setup(l => l.channel)
            .returns(() => instance(outputChannel));
        folderService = TypeMoq.Mock.ofType<ILanguageServerFolderService>(undefined, TypeMoq.MockBehavior.Strict);
        workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>(undefined, TypeMoq.MockBehavior.Strict);
        resource = Uri.file(__dirname);
        languageServerDownloader = new LanguageServerDownloader(
            undefined as any,
            lsOutputChannel.object,
            undefined as any,
            folderService.object,
            undefined as any,
            undefined as any,
            workspaceService.object
        );
    });

    test('Get download info - HTTPS with resource', async () => {
        const cfg = TypeMoq.Mock.ofType<WorkspaceConfiguration>(undefined, TypeMoq.MockBehavior.Strict);
        cfg
            .setup(c => c.get('proxyStrictSSL', true))
            .returns(() => true)
            .verifiable(TypeMoq.Times.once());
        workspaceService
            .setup(w => w.getConfiguration(TypeMoq.It.isValue('http'), TypeMoq.It.isValue(resource)))
            .returns(() => cfg.object)
            .verifiable(TypeMoq.Times.once());

        const pkg = makePkgInfo('ls', 'https://a.b.com/x/y/z/ls.nupkg');
        folderService
            .setup(f => f.getLatestLanguageServerVersion(resource))
            .returns(() => Promise.resolve(pkg))
            .verifiable(TypeMoq.Times.once());

        const [uri, version] = await languageServerDownloader.getDownloadInfo(resource);

        folderService.verifyAll();
        workspaceService.verifyAll();
        expect(uri).to.equal(pkg.uri);
        expect(version).to.equal(pkg.version.raw);
    });

    test('Get download info - HTTPS without resource', async () => {
        const cfg = TypeMoq.Mock.ofType<WorkspaceConfiguration>(undefined, TypeMoq.MockBehavior.Strict);
        cfg
            .setup(c => c.get('proxyStrictSSL', true))
            .returns(() => true)
            .verifiable(TypeMoq.Times.once());
        workspaceService
            .setup(w => w.getConfiguration(TypeMoq.It.isValue('http'), undefined))
            .returns(() => cfg.object)
            .verifiable(TypeMoq.Times.once());

        const pkg = makePkgInfo('ls', 'https://a.b.com/x/y/z/ls.nupkg');
        folderService
            .setup(f => f.getLatestLanguageServerVersion(undefined))
            .returns(() => Promise.resolve(pkg))
            .verifiable(TypeMoq.Times.once());

        const [uri, version] = await languageServerDownloader.getDownloadInfo(undefined);

        folderService.verifyAll();
        workspaceService.verifyAll();
        expect(uri).to.equal(pkg.uri);
        expect(version).to.equal(pkg.version.raw);
    });

    test('Get download info - HTTPS disabled', async () => {
        const cfg = TypeMoq.Mock.ofType<WorkspaceConfiguration>(undefined, TypeMoq.MockBehavior.Strict);
        cfg
            .setup(c => c.get('proxyStrictSSL', true))
            .returns(() => false)
            .verifiable(TypeMoq.Times.once());
        workspaceService
            .setup(w => w.getConfiguration(TypeMoq.It.isValue('http'), TypeMoq.It.isValue(resource)))
            .returns(() => cfg.object)
            .verifiable(TypeMoq.Times.once());

        const pkg = makePkgInfo('ls', 'https://a.b.com/x/y/z/ls.nupkg');
        folderService
            .setup(f => f.getLatestLanguageServerVersion(resource))
            .returns(() => Promise.resolve(pkg))
            .verifiable(TypeMoq.Times.once());

        const [uri, version] = await languageServerDownloader.getDownloadInfo(resource);

        folderService.verifyAll();
        workspaceService.verifyAll();
        // tslint:disable-next-line:no-http-string
        expect(uri).to.deep.equal('http://a.b.com/x/y/z/ls.nupkg');
        expect(version).to.equal(pkg.version.raw);
    });

    test('Get download info - HTTP', async () => {
        // tslint:disable-next-line:no-http-string
        const pkg = makePkgInfo('ls', 'http://a.b.com/x/y/z/ls.nupkg');
        folderService
            .setup(f => f.getLatestLanguageServerVersion(resource))
            .returns(() => Promise.resolve(pkg))
            .verifiable(TypeMoq.Times.once());

        const [uri, version] = await languageServerDownloader.getDownloadInfo(resource);

        folderService.verifyAll();
        workspaceService.verifyAll();
        expect(uri).to.equal(pkg.uri);
        expect(version).to.equal(pkg.version.raw);
    });

    test('Get download info - bogus URL', async () => {
        const pkg = makePkgInfo('ls', 'xyz');
        folderService
            .setup(f => f.getLatestLanguageServerVersion(resource))
            .returns(() => Promise.resolve(pkg))
            .verifiable(TypeMoq.Times.once());

        const [uri, version] = await languageServerDownloader.getDownloadInfo(resource);

        folderService.verifyAll();
        workspaceService.verifyAll();
        expect(uri).to.equal(pkg.uri);
        expect(version).to.equal(pkg.version.raw);
    });

    suite('Test LanguageServerDownloader.downloadFile', () => {
        let lsDownloader: LanguageServerDownloader;
        let outputChannel: IOutputChannel;
        let fileDownloader: IFileDownloader;
        let lsOutputChannel: TypeMoq.IMock<ILanguageServerOutputChannel>;
        // tslint:disable-next-line: no-http-string
        const downloadUri = 'http://wow.com/file.txt';
        const downloadTitle = 'Downloadimg file.txt';
        setup(() => {
            const platformData = mock(PlatformData);
            outputChannel = mock(MockOutputChannel);
            fileDownloader = mock(FileDownloader);
            const lsFolderService = mock(LanguageServerFolderService);
            const appShell = mock(ApplicationShell);
            const fs = mock(FileSystem);
            // tslint:disable-next-line: no-shadowed-variable
            const workspaceService = mock(WorkspaceService);
            lsOutputChannel = TypeMoq.Mock.ofType<ILanguageServerOutputChannel>();
            lsOutputChannel
                .setup(l => l.channel)
                .returns(() => instance(outputChannel));

            lsDownloader = new LanguageServerDownloader(instance(platformData),
                lsOutputChannel.object, instance(fileDownloader),
                instance(lsFolderService), instance(appShell),
                instance(fs), instance(workspaceService));
        });

        test('Downloaded file name must be returned from file downloader and right args passed', async () => {
            const downloadedFile = 'This is the downloaded file';
            when(fileDownloader.downloadFile(anything(), anything())).thenResolve(downloadedFile);
            const expectedDownloadOptions = {
                extension: '.nupkg',
                outputChannel: instance(outputChannel),
                progressMessagePrefix: downloadTitle
            };

            const file = await lsDownloader.downloadFile(downloadUri, downloadTitle);

            expect(file).to.be.equal(downloadedFile);
            verify(fileDownloader.downloadFile(anything(), anything())).once();
            verify(fileDownloader.downloadFile(downloadUri, deepEqual(expectedDownloadOptions))).once();
        });
        test('If download succeeds then log completion message', async () => {
            when(fileDownloader.downloadFile(anything(), anything())).thenResolve();

            await lsDownloader.downloadFile(downloadUri, downloadTitle);

            verify(fileDownloader.downloadFile(anything(), anything())).once();
            verify(outputChannel.appendLine(LanguageService.extractionCompletedOutputMessage())).once();
        });
        test('If download fails do not log completion message', async () => {
            const ex = new Error('kaboom');
            when(fileDownloader.downloadFile(anything(), anything())).thenReject(ex);

            const promise = lsDownloader.downloadFile(downloadUri, downloadTitle);
            await promise.catch(noop);

            verify(outputChannel.appendLine(LanguageService.extractionCompletedOutputMessage())).never();
            expect(promise).to.eventually.be.rejectedWith('kaboom');
        });
    });

    // tslint:disable-next-line:max-func-body-length
    suite('Test LanguageServerDownloader.downloadLanguageServer', () => {
        const failure = new Error('kaboom');

        class LanguageServerDownloaderTest extends LanguageServerDownloader {
            // tslint:disable-next-line:no-unnecessary-override
            public async downloadLanguageServer(destinationFolder: string, res?: Resource): Promise<void> {
                return super.downloadLanguageServer(destinationFolder, res);
            }
            public async downloadFile(_uri: string, _title: string): Promise<string> {
                throw failure;
            }
        }
        class LanguageServerExtractorTest extends LanguageServerDownloader {
            // tslint:disable-next-line:no-unnecessary-override
            public async downloadLanguageServer(destinationFolder: string, res?: Resource): Promise<void> {
                return super.downloadLanguageServer(destinationFolder, res);
            }
            // tslint:disable-next-line:no-unnecessary-override
            public async getDownloadInfo(res?: Resource) {
                return super.getDownloadInfo(res);
            }
            public async downloadFile() {
                return 'random';
            }
            protected async unpackArchive(_extensionPath: string, _tempFilePath: string): Promise<void> {
                throw failure;
            }
        }
        let output: TypeMoq.IMock<IOutputChannel>;
        let appShell: TypeMoq.IMock<IApplicationShell>;
        let fs: TypeMoq.IMock<IFileSystem>;
        let platformData: TypeMoq.IMock<IPlatformData>;
        let languageServerDownloaderTest: LanguageServerDownloaderTest;
        let languageServerExtractorTest: LanguageServerExtractorTest;
        setup(() => {
            appShell = TypeMoq.Mock.ofType<IApplicationShell>(undefined, TypeMoq.MockBehavior.Strict);
            folderService = TypeMoq.Mock.ofType<ILanguageServerFolderService>(undefined, TypeMoq.MockBehavior.Strict);
            output = TypeMoq.Mock.ofType<IOutputChannel>();
            fs = TypeMoq.Mock.ofType<IFileSystem>(undefined, TypeMoq.MockBehavior.Strict);
            platformData = TypeMoq.Mock.ofType<IPlatformData>(undefined, TypeMoq.MockBehavior.Strict);
            lsOutputChannel = TypeMoq.Mock.ofType<ILanguageServerOutputChannel>();
            lsOutputChannel
                .setup(l => l.channel)
                .returns(() => output.object);

            languageServerDownloaderTest = new LanguageServerDownloaderTest(
                platformData.object,
                lsOutputChannel.object,
                undefined as any,
                folderService.object,
                appShell.object,
                fs.object,
                workspaceService.object
            );
            languageServerExtractorTest = new LanguageServerExtractorTest(
                platformData.object,
                lsOutputChannel.object,
                undefined as any,
                folderService.object,
                appShell.object,
                fs.object,
                workspaceService.object
            );
        });
        test('Display error message if LS downloading fails', async () => {
            const pkg = makePkgInfo('ls', 'xyz');
            folderService
                .setup(f => f.getLatestLanguageServerVersion(resource))
                .returns(() => Promise.resolve(pkg));
            output
                .setup(o => o.appendLine(LanguageService.downloadFailedOutputMessage()));
            output
                .setup(o => o.appendLine((failure as unknown) as string));
            appShell
                .setup(a => a.showErrorMessage(LanguageService.lsFailedToDownload(), Common.openOutputPanel()))
                .returns(() => Promise.resolve(undefined));

            let actualFailure: Error | undefined;
            try {
                await languageServerDownloaderTest.downloadLanguageServer('', resource);
            } catch (err) {
                actualFailure = err;
            }

            expect(actualFailure).to.not.equal(undefined, 'error not thrown');
            folderService.verifyAll();
            output.verifyAll();
            appShell.verifyAll();
            fs.verifyAll();
            platformData.verifyAll();
        });
        test('Display error message if LS extraction fails', async () => {
            const pkg = makePkgInfo('ls', 'xyz');
            folderService
                .setup(f => f.getLatestLanguageServerVersion(resource))
                .returns(() => Promise.resolve(pkg));
            output
                .setup(o => o.appendLine(LanguageService.extractionFailedOutputMessage()));
            output
                .setup(o => o.appendLine((failure as unknown) as string));
            appShell
                .setup(a => a.showErrorMessage(LanguageService.lsFailedToExtract(), Common.openOutputPanel()))
                .returns(() => Promise.resolve(undefined));

            let actualFailure: Error | undefined;
            try {
                await languageServerExtractorTest.downloadLanguageServer('', resource);
            } catch (err) {
                actualFailure = err;
            }

            expect(actualFailure).to.not.equal(undefined, 'error not thrown');
            folderService.verifyAll();
            output.verifyAll();
            appShell.verifyAll();
            fs.verifyAll();
            platformData.verifyAll();
        });
    });
});

function makePkgInfo(name: string, uri: string, version: string = '0.0.0') {
    return {
        package: name,
        uri: uri,
        version: new SemVer(version)
    } as any;
}
