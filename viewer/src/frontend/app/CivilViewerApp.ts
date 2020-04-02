/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { isElectronRenderer } from "@bentley/bentleyjs-core";
import { BentleyCloudRpcParams, OidcDesktopClientConfiguration } from "@bentley/imodeljs-common";
import { Config, UrlDiscoveryClient, OidcFrontendClientConfiguration, IOidcFrontendClient } from "@bentley/imodeljs-clients";
import { IModelApp, OidcBrowserClient, FrontendRequestContext, OidcDesktopClientRenderer, IModelAppOptions } from "@bentley/imodeljs-frontend";
import { Presentation } from "@bentley/presentation-frontend";
import { UiCore } from "@bentley/ui-core";
import { UiComponents } from "@bentley/ui-components";
import { UiFramework, AppNotificationManager } from "@bentley/ui-framework";

import { UseBackend } from "../../common/configuration";
import initRpc from "../api/rpc";
import { AppState, AppStore } from "./AppState";

// subclass of IModelApp needed to use imodeljs-frontend
export class CivilViewerApp {
  private static _isReady: Promise<void>;
  private static _oidcClient: IOidcFrontendClient;
  private static _appState: AppState;

  public static get ready(): Promise<void> { return this._isReady; }

  public static get oidcClient(): IOidcFrontendClient { return this._oidcClient; }

  public static get store(): AppStore { return this._appState.store; }

  public static startup(opts?: IModelAppOptions): void {
    opts = opts ? opts : {};

    // Use the AppNotificationManager subclass from ui-framework to get prompts and messages
    opts.notifications = new AppNotificationManager();

    IModelApp.startup(opts);

    // contains various initialization promises which need
    // to be fulfilled before the app is ready
    const initPromises = new Array<Promise<any>>();

    // initialize localization for the app
    initPromises.push(IModelApp.i18n.registerNamespace("CivilViewerApp").readFinished);

    // create the application state store for Redux
    this._appState = new AppState();

    // initialize UiCore
    initPromises.push(UiCore.initialize(IModelApp.i18n));

    // initialize UiComponents
    initPromises.push(UiComponents.initialize(IModelApp.i18n));

    // initialize UiFramework
    initPromises.push(UiFramework.initialize(this.store, IModelApp.i18n));

    // initialize Presentation
    Presentation.initialize({
      activeLocale: IModelApp.i18n.languageList()[0],
    });

    // initialize RPC communication
    initPromises.push(CivilViewerApp.initializeRpc());

    // initialize OIDC
    initPromises.push(CivilViewerApp.initializeOidc());

    // the app is ready when all initialization promises are fulfilled
    this._isReady = Promise.all(initPromises).then(() => { });
  }

  private static async initializeRpc(): Promise<void> {
    const rpcParams = await this.getConnectionInfo();
    initRpc(rpcParams);
  }

  private static async initializeOidc() {
    this._oidcClient = this.getOidcClient();
    const requestContext = new FrontendRequestContext();
    await this._oidcClient.initialize(requestContext);

    IModelApp.authorizationClient = this._oidcClient;
    UiFramework.oidcClient = this._oidcClient;
  }

  private static getOidcClient(): IOidcFrontendClient {
    // TODO: Make this the same as SVA
    const scope = "openid email profile organization imodelhub context-registry-service:read-only product-settings-service urlps-third-party";
    if (isElectronRenderer) {
      const clientId = Config.App.getString("imjs_electron_test_client_id");
      const redirectUri = Config.App.getString("imjs_electron_test_redirect_uri");
      const oidcConfiguration: OidcDesktopClientConfiguration = { clientId, redirectUri, scope: scope + " offline_access" };
      const oidcClient = new OidcDesktopClientRenderer(oidcConfiguration);
      return oidcClient;
    } else {
      const clientId = Config.App.getString("imjs_browser_test_client_id");
      const redirectUri = Config.App.getString("imjs_browser_test_redirect_uri");
      const postSignoutRedirectUri = Config.App.get("imjs_browser_test_post_signout_redirect_uri");
      const oidcConfiguration: OidcFrontendClientConfiguration = { clientId, redirectUri, postSignoutRedirectUri, scope: scope + " imodeljs-router", responseType: "code" };
      const oidcClient = new OidcBrowserClient(oidcConfiguration);
      return oidcClient;
    }
  }

  public static shutdown() {
    this._oidcClient.dispose();
    IModelApp.shutdown();
  }

  private static async getConnectionInfo(): Promise<BentleyCloudRpcParams | undefined> {
    const usedBackend = Config.App.get("imjs_backend", UseBackend.Local);

    if (usedBackend === UseBackend.GeneralPurpose) {
      const urlClient = new UrlDiscoveryClient();
      const requestContext = new FrontendRequestContext();
      const orchestratorUrl = await urlClient.discoverUrl(requestContext, "iModelJsOrchestrator.K8S", undefined);
      return { info: { title: "general-purpose-imodeljs-backend", version: "v1.0" }, uriPrefix: orchestratorUrl };
    }

    if (usedBackend === UseBackend.Local)
      return undefined;

    throw new Error(`Invalid backend "${usedBackend}" specified in configuration`);
  }
}
