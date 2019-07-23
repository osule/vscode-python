// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { InteractiveWindowMessages } from '../../client/datascience/interactive-common/interactiveWindowTypes';
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

            default:
                break;
        }

        return result;
    }

}
