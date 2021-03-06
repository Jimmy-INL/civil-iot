/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { ViewState } from "@bentley/imodeljs-frontend";

import {
  ToolWidget,
  ZoneState,
  WidgetState,
  ContentLayoutDef,
  ContentGroup,
  FrontstageProvider,
  Frontstage,
  Zone,
  Widget,
  CoreTools,
  SyncUiEventId,
  ContentViewManager,
  ItemList,
  CustomItemDef,
  StagePanel,
  IModelViewportControl,
  UiFramework,
  IModelConnectedViewSelector,
  IModelConnectedNavigationWidget,
  PopupButton,
  PopupButtonChildrenRenderPropArgs,
  StagePanelState,
} from "@bentley/ui-framework";

import { TableContent } from "../contentviews/TableContent";
import { TreeWidget } from "../widgets/TreeWidget";
import { PropertyGridWidget } from "../widgets/PropertyGridWidget";
import { AppStatusBarWidget } from "../statusbars/AppStatusBar";
import { AppUi } from "../AppUi";
import { SvgSprite } from "@bentley/ui-core";
import civilIcon from "../../components/CivilBrowser/civil-model.svg";
import { CivilBrowser } from "../../components/CivilBrowser/CivilBrowser";
import { TerrainSettings } from "../../components/TerrainSettings/TerrainSettings";
import { TimeSeriesDiagram } from "../../components/TimeSeriesDiagram";
import "./BottomPanel.scss";

/**
 * Sample Frontstage for Civil IoT Viewer application
 */
export class SampleFrontstage extends FrontstageProvider {
  // ID of the presentation ruleset used by all of the controls; the ruleset
  // can be found at `assets/presentation_rules/Default.PresentationRuleSet.xml`
  private _rulesetId = "Default";

  // Content layout for content views
  private _contentLayoutDef: ContentLayoutDef;

  // Content group for both layouts
  private _contentGroup: ContentGroup;

  constructor(public viewStates: ViewState[]) {
    super();
    // Set default Presentation Rule Set Id in Redux store
    UiFramework.setDefaultRulesetId(this._rulesetId);

    // Create the content layouts.
    this._contentLayoutDef = new ContentLayoutDef({
      horizontalSplit: { percentage: 1.0, top: 0, bottom: 0 },
    });

    // Create the content group.
    this._contentGroup = new ContentGroup({
      contents: [
        {
          classId: IModelViewportControl,
          applicationData: {
            viewState: this.viewStates[0],
            iModelConnection: UiFramework.getIModelConnection(),
          },
        },
        {
          classId: TableContent,
          applicationData: {
            iModelConnection: UiFramework.getIModelConnection(),
            rulesetId: this._rulesetId,
          },
        },
      ],
    });
  }

  /** Define the Frontstage properties */
  public get frontstage() {

    return (
      <Frontstage id="SampleFrontstage"
        defaultTool={CoreTools.selectElementCommand} defaultLayout={this._contentLayoutDef} contentGroup={this._contentGroup}
        isInFooterMode={true}

        topLeft={
          < Zone
            widgets={
              [
                <Widget isFreeform={true} element={<SampleToolWidget />} />,
              ]}
          />
        }
        topCenter={
          < Zone
            widgets={
              [
                <Widget isToolSettings={true} />,
              ]}
          />
        }
        topRight={
          < Zone
            widgets={
              [
                /** Use standard NavigationWidget delivered in ui-framework */
                <Widget isFreeform={true} element={<IModelConnectedNavigationWidget suffixVerticalItems=
                  {new ItemList([this._viewSelectorItemDef, this._terrainSettingsItemDef])} />} />,
              ]}
          />
        }
        centerRight={
          < Zone defaultState={ZoneState.Minimized} allowsMerging={true}
            widgets={
              [
                <Widget control={TreeWidget} fillZone={true}
                  iconSpec="icon-tree" labelKey="CivilViewerApp:components.tree"
                  applicationData={{
                    iModelConnection: UiFramework.getIModelConnection(),
                    rulesetId: this._rulesetId,
                  }}
                />,
              ]}
          />
        }
        bottomCenter={
          < Zone
            widgets={
              [
                <Widget isStatusBar={true} control={AppStatusBarWidget} />,
              ]}
          />
        }
        bottomRight={
          < Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={
              [
                <Widget id="Properties" control={PropertyGridWidget} defaultState={WidgetState.Closed} fillZone={true}
                  iconSpec="icon-properties-list" labelKey="CivilViewerApp:components.properties"
                  applicationData={{
                    iModelConnection: UiFramework.getIModelConnection(),
                    rulesetId: this._rulesetId,
                  }}
                  syncEventIds={[SyncUiEventId.SelectionSetChanged]}
                  stateFunc={this._determineWidgetStateForSelectionSet}
                />,
              ]}
          />
        }
        rightPanel={
          < StagePanel
            allowedZones={[6, 9]}
          />
        }
        leftPanel={
          <StagePanel
            size={310} minSize={310}
            allowedZones={[6, 9]}
            widgets={[
              <Widget element={<CivilBrowser imodel={UiFramework.getIModelConnection()!} />} fillZone={true}
                iconSpec={<SvgSprite src={civilIcon} />} label="Model Breakdown"
                applicationData={{
                  iModelConnection: UiFramework.getIModelConnection(),
                }}
              />,
            ]}
          />
        }
        bottomPanel={
          <StagePanel
            size={360}
            minSize={340}
            resizable={false}
            allowedZones={[6, 9]}
            defaultState={StagePanelState.Off}
            widgets={[
              <Widget element={<TimeSeriesDiagram />} fillZone={true}
                label="Time Series Browser"
              />,
            ]}
          />
        }
      />
    );
  }

  /** Determine the WidgetState based on the Selection Set */
  private _determineWidgetStateForSelectionSet = (): WidgetState => {
    const activeContentControl = ContentViewManager.getActiveContentControl();
    if (activeContentControl && activeContentControl.viewport && (activeContentControl.viewport.view.iModel.selectionSet.size > 0))
      return WidgetState.Open;
    return WidgetState.Closed;
  }

  /** Get the CustomItemDef for ViewSelector  */
  private get _viewSelectorItemDef() {
    return new CustomItemDef({
      customId: "sampleApp:viewSelector",
      reactElement: (
        <IModelConnectedViewSelector
          listenForShowUpdates={false}  // Demo for showing only the same type of view in ViewSelector - See IModelViewport.tsx, onActivated
        />
      ),
    });
  }

  /** Get the CustomItemDef for TerrainSettings  */
  public get _terrainSettingsItemDef() {
    return new CustomItemDef({
      customId: "sampleApp:viewSelector",
      reactElement: (
        <PopupButton iconSpec="icon-network" label="Map Settings">
          {this._renderPopupContents}
        </PopupButton>
      ),
    });
  }

  private _renderPopupContents = ({ closePanel }: PopupButtonChildrenRenderPropArgs) => {
    return (
      <TerrainSettings onExecute={closePanel} onCancel={closePanel} />
    );
  }

}

/**
 * Define a ToolWidget with Buttons to display in the TopLeft zone.
 */
class SampleToolWidget extends React.Component {

  public render(): React.ReactNode {
    const horizontalItems = new ItemList([
      CoreTools.selectElementCommand,
    ]);

    return (
      <ToolWidget
        appButton={AppUi.backstageToggleCommand}
        horizontalItems={horizontalItems}
      />
    );
  }
}
