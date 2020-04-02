/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { IModelApp } from "@bentley/imodeljs-frontend";
import { BackstageItemUtilities, BackstageItem } from "@bentley/ui-abstract";

export class AppBackstageItemProvider {
  /** id of provider */
  public readonly id = "CivilViewerApp.AppBackstageItemProvider";

  private _backstageItems: ReadonlyArray<BackstageItem> | undefined = undefined;

  public get backstageItems(): ReadonlyArray<BackstageItem> {
    if (!this._backstageItems) {
      this._backstageItems = [
        BackstageItemUtilities.createStageLauncher("SampleFrontstage", 100, 10,
          IModelApp.i18n.translate("CivilViewerApp:backstage.sampleFrontstage"), undefined, "icon-placeholder"),
        BackstageItemUtilities.createStageLauncher("SampleFrontstage2", 100, 20,
          IModelApp.i18n.translate("CivilViewerApp:backstage.sampleFrontstage2"), undefined, "icon-placeholder"),
      ];
    }
    return this._backstageItems;
  }
}
