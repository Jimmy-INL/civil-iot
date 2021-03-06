/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
 * Licensed under the MIT License. See LICENSE.md in the project root for license terms.
 *--------------------------------------------------------------------------------------------*/
import { IModelApp, Marker, BeButtonEvent, Cluster, MarkerSet, DecorateContext, BeButton, imageElementFromUrl, ScreenViewport } from "@bentley/imodeljs-frontend";
import { XYAndZ, XAndY, Range3d, Point3d } from "@bentley/geometry-core";
import { BeDuration } from "@bentley/bentleyjs-core";
import { CivilComponentProps, CivilDataComponentType, CivilDataModel } from "../api/CivilDataModel";
import { CivilBrowser } from "./CivilBrowser/CivilBrowser";
import { IotDataPolling } from "../api/IotDataPolling";

const STATUS_TO_STRING = ["Offline", "Normal", "Medium", "High"];
const STATUS_COUNT = 4;
const IMAGE_SIZE = 30;
const MIN_CLUSTER_SIZE = 2;
const COLORS = ["black", "darkgreen", "gold", "red"];

/** Marker to show a sensor location. */
export class SensorMarker extends Marker {
  protected _component: CivilComponentProps;
  protected _image: HTMLImageElement;
  protected _isFeatured: boolean;
  protected _doSensorAdtPolling: boolean;
  protected _tooltipViewPoint: Point3d | undefined;
  protected _status: number = 0;
  protected _tooltip: string;
  protected _oldValue1: string;
  protected _oldValue2: string;

  public get status(): number {
    return this._status;
  }
  public get markerImage(): HTMLImageElement {
    return this._image;
  }

  /** Create a new SensorMarker */
  constructor(public component: CivilComponentProps, image: HTMLImageElement, isFeatured: boolean) {
    super(
      {
        x: component.position ? component.position.x : 0,
        y: component.position ? component.position.y : 0,
        z: component.position ? component.position.z : 0,
      },
      { x: IMAGE_SIZE, y: IMAGE_SIZE },
    );

    this._doSensorAdtPolling = true;
    this._isFeatured = isFeatured;
    this._oldValue1 = "";
    this._oldValue2 = "";

    this._image = image;
    this.setImage(image);

    const data = CivilDataModel.get();
    const asset = data.getComponentForId(component.composingId);

    this._tooltip = "";
    this._tooltip += "<b>Name: </b> " + component.label + "<br>";
    this._tooltip += "<b>Type: </b> " + component.typeCode! + "<br>";
    this._tooltip += "<b>Asset: </b>" + asset?.label + "<br>";

    const div = document.createElement("div");
    div.innerHTML = this._tooltip;
    this.title = div;

    this.setScaleFactor({ low: 0.2, high: 1.4 }); // make size 20% at back of frustum and 140% at front of frustum (if camera is on)
    this._component = component;

    // tslint:disable-next-line: no-floating-promises
    this.updateSensorDataLoop();
  }

  public endSensorDataPolling() {
    this._doSensorAdtPolling = false;
    if (this._component.type !== CivilDataComponentType.TrafficCamera)
      IotDataPolling.get().removeIotDataListener(this._component.label);
  }

  private async updateSensorDataLoop() {
    let wasPollingStarted: boolean = false;

    if (this._component.type !== CivilDataComponentType.TrafficCamera)
      IotDataPolling.get().addIotDataListener(this._component.label);

    while (this._doSensorAdtPolling) {
      // suspend polling if ADT polling toggle switch is off
      if ((IModelApp as any)._doAdtPolling) {
        wasPollingStarted = true;
        const sensorData = IotDataPolling.get().getIotData(this._component.label);
        const lastStatus: number = this._status;
        if (this._component.type === CivilDataComponentType.TrafficCamera)
          this._status = 1;
        else
          this._status = this.getSensorStatus(sensorData, this._component.type);
        if (this._status !== lastStatus)
          IModelApp.viewManager.selectedView!.invalidateDecorations();

        if (IModelApp.notifications.isToolTipOpen && this._tooltipViewPoint)
          this.updateTooltip(this._component, sensorData);
      } else if (wasPollingStarted) {
        wasPollingStarted = false;
        this._status = 0;   // reset status to 0 (black)
        IModelApp.viewManager.selectedView!.invalidateDecorations();
      }
      await BeDuration.wait(1000);
    }
  }

  private getSensorStatus(sensorData: any, type: CivilDataComponentType): number {
    const TEMPERATURE_UPPER_LIMIT = 100;
    const CO_UPPER_LIMIT = 4.5;
    const NO2_UPPER_LIMIT = 50;
    const VEHICLE_UPPER_LIMIT = 800;
    const TRUCK_UPPER_LIMIT = 160;
    const VIBRATION_UPPER_LIMIT = 0.3;
    const DEFLECTION_UPPER_LIMIT = 12;
    let sensorStatus = 1;

    if (!sensorData)
      return 0;

    switch (type) {
      case CivilDataComponentType.AirQualitySensor:
        if (sensorData.hasOwnProperty("observationLabel1") && sensorData.observationLabel1 === "CO") {
          if (sensorData.observationValue1 > (CO_UPPER_LIMIT * 0.8))
            sensorStatus = 2;
          if (sensorData.observationValue1 > CO_UPPER_LIMIT)
            sensorStatus = 3;
        }
        if (sensorData.hasOwnProperty("observationLabel2") && sensorData.observationLabel2 === "NO2") {
          if (sensorData.observationValue2 > (NO2_UPPER_LIMIT * 0.8)) {
            if (sensorStatus < 2) sensorStatus = 2;
          }
          if (sensorData.observationValue2 > NO2_UPPER_LIMIT)
            sensorStatus = 3;
        }
        break;
      case CivilDataComponentType.TemperatureSensor:
        if (sensorData.hasOwnProperty("observationLabel1") && sensorData.observationLabel1 === "Temperature") {
          if (sensorData.observationValue1 > (TEMPERATURE_UPPER_LIMIT * 0.8))
            sensorStatus = 2;
          if (sensorData.observationValue1 > TEMPERATURE_UPPER_LIMIT)
            sensorStatus = 3;
        }
        break;
      case CivilDataComponentType.VibrationSensor:
        if (sensorData.hasOwnProperty("observationLabel1") && sensorData.observationLabel1 === "Vibration amplitude") {
          if (sensorData.observationValue1 > (VIBRATION_UPPER_LIMIT * 0.8))
            sensorStatus = 2;
          if (sensorData.observationValue1 > VIBRATION_UPPER_LIMIT)
            sensorStatus = 3;
        }
        if (sensorData.hasOwnProperty("observationLabel1") && sensorData.observationLabel1 === "Deflection") {
          if (sensorData.observationValue1 > (DEFLECTION_UPPER_LIMIT * 0.8)) {
            if (sensorStatus < 2) sensorStatus = 2;
          }
          if (sensorData.observationValue1 > DEFLECTION_UPPER_LIMIT)
            sensorStatus = 3;
        }
        break;
      case CivilDataComponentType.TrafficSensor:
        if (sensorData.hasOwnProperty("observationLabel1") && sensorData.observationLabel1 === "Vibration amplitude") {
          if (sensorData.observationValue1 > (VEHICLE_UPPER_LIMIT * 0.8))
            sensorStatus = 2;
          if (sensorData.observationValue1 > VEHICLE_UPPER_LIMIT)
            sensorStatus = 3;
        }
        if (sensorData.hasOwnProperty("observationLabel1") && sensorData.observationLabel1 === "Deflection") {
          if (sensorData.observationValue1 > (TRUCK_UPPER_LIMIT * 0.8)) {
            if (sensorStatus < 2) sensorStatus = 2;
          }
          if (sensorData.observationValue1 > TRUCK_UPPER_LIMIT)
            sensorStatus = 3;
        }
        break;
    }
    return sensorStatus;
  }

  public updateTooltip(component: CivilComponentProps, sensorData: any) {

    let title = this._tooltip;
    let value1: string = "";
    let value2: string = "";
    switch (component.type) {
      case CivilDataComponentType.AirQualitySensor:
      case CivilDataComponentType.TemperatureSensor:
      case CivilDataComponentType.VibrationSensor:
      case CivilDataComponentType.TrafficSensor:
        if (sensorData && sensorData.hasOwnProperty("observationLabel1")) {
          value1 = sensorData.observationValue1.toFixed(2);
          title += "<b>" + sensorData.observationLabel1 + ": </b>" + value1 + " " + sensorData.observationUnit1 + "<br>";
        }
        if (sensorData && sensorData.hasOwnProperty("observationLabel2")) {
          value2 = sensorData.observationValue2.toFixed(2);
          title += "<b>" + sensorData.observationLabel2 + ": </b>" + value2 + " " + sensorData.observationUnit2 + "<br>";
        }
        break;
      case CivilDataComponentType.TrafficCamera:
        const onlineStatus = (IModelApp as any)._doAdtPolling;
        title += "<b>Status: </b>" + (onlineStatus ? "Online" : "Offline") + "<br>";
        this._status = (onlineStatus ? 1 : 0);
        IModelApp.viewManager.selectedView!.invalidateDecorations();
        break;
    }

    if (this._oldValue1.toString() !== value1.toString() || this._oldValue2.toString() !== value2.toString() || !IModelApp.notifications.isToolTipOpen) {
      const div = document.createElement("div");
      div.innerHTML = title;
      this.title = div;
      IModelApp.viewManager.selectedView!.openToolTip(this.title!, this._tooltipViewPoint, this.tooltipOptions);
      this._oldValue1 = value1;
      this._oldValue2 = value2;
    }
  }

  /** Called when the mouse pointer moves over this Marker */
  public onMouseMove(_ev: BeButtonEvent): void {
  }

  /** Called when the mouse pointer leaves this Marker. */
  public onMouseLeave() {
    super.onMouseLeave();
    this._tooltipViewPoint = undefined;
    IModelApp.notifications.clearToolTip();
  }

  /** Called when the mouse pointer enters this Marker. */
  public onMouseEnter(ev: BeButtonEvent) {
    super.onMouseEnter(ev);

    this._tooltipViewPoint = ev.viewPoint;
    this.updateTooltip(this._component, undefined);
  }

  /** Show the cluster as a white circle with an outline */
  public drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS[this.status];
    ctx.fillStyle = this._isFeatured ? "lightcyan" : "white";
    ctx.lineWidth = this._isFeatured ? 5 : 3;
    ctx.arc(0, 0, this._isFeatured ? 25 : 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  public onMouseButton(ev: BeButtonEvent): boolean {
    if (
      BeButton.Data !== ev.button ||
      !ev.isDown ||
      !ev.viewport ||
      !ev.viewport.view.isSpatialView()
    )
      return true;
    ((IModelApp as any).civilBrowser as CivilBrowser).markerClicked(this._component);
    return true; // Don't allow clicks to be sent to active tool...
  }
}

/** A Marker used to show a cluster of sensors. */
class SensorClusterMarker extends Marker {
  private _cluster: Cluster<SensorMarker>;
  private _maxStatus: number = 0;

  /** Create a new cluster marker */
  constructor(location: XYAndZ, size: XAndY, cluster: Cluster<SensorMarker>) {
    super(location, size);

    this._cluster = cluster;
    this._cluster.markers.forEach((marker) => {
      if (marker.status > this._maxStatus) this._maxStatus = marker.status;
    });
    this.label = cluster.markers.length.toLocaleString();
    this.labelColor = COLORS[this._maxStatus];
    this.labelFont = "bold 16px san-serif";
    const statusCounts: number[] = new Array<number>();
    for (let i: number = 0; i < STATUS_COUNT; i++) statusCounts[i] = 0;
    cluster.markers.forEach((marker) => {
      statusCounts[marker.status]++;
    });

    let title = "<table><caption><b>Status:</b></caption>";
    for (let i: number = 0; i < STATUS_COUNT; i++) {
      if (statusCounts[i])
        title +=
          "<tr><td>" +
          STATUS_TO_STRING[i] +
          "</td><td><b>" +
          statusCounts[i] +
          "<b></td></tr>";
    }
    title += "</table>";

    const div = document.createElement("div");
    div.innerHTML = title;
    this.title = div;
  }

  /** Show the cluster as a white circle with an outline */
  public drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS[this._maxStatus];
    ctx.fillStyle = "white";
    ctx.lineWidth = 3;
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  public onMouseButton(ev: BeButtonEvent): boolean {
    if (
      BeButton.Data !== ev.button ||
      !ev.isDown ||
      !ev.viewport ||
      !ev.viewport.view.isSpatialView()
    )
      return true;

    const positions: Point3d[] = [];
    this._cluster.markers.forEach((marker) => {
      if (marker.component.position)
        positions.push(marker.component.position);
    });
    if (0 < positions.length) {
      const range = Range3d.createArray(positions);
      range.expandInPlace(20);
      ev.viewport.zoomToVolume(range, { animateFrustumChange: true });

      IModelApp.notifications.clearToolTip();
    }
    return true; // Don't allow clicks to be sent to active tool...
  }
}

export class SensorMarkerSet extends MarkerSet<SensorMarker> {
  public minimumClusterSize = MIN_CLUSTER_SIZE;
  protected getClusterMarker(cluster: Cluster<SensorMarker>): Marker {
    return SensorClusterMarker.makeFrom(
      cluster.markers[0],
      cluster,
      cluster.markers[0].markerImage,
    );
  }
}

export class SensorMarkerSetDecoration {
  private _markerSet = new SensorMarkerSet();
  private _loading?: Promise<any>;
  private _images: Array<HTMLImageElement | undefined> = [];
  public static decorator?: SensorMarkerSetDecoration; // static variable so we can tell if the decorator is active.

  public constructor(sensors: CivilComponentProps[], featuredSensorId?: string) {
    this.loadAll(sensors, featuredSensorId); // tslint:disable-line: no-floating-promises
  }

  // load all images. After they're loaded, make the incident markers
  private async loadAll(sensors: CivilComponentProps[], featuredSensorId?: string) {
    const typeIndex = [
      CivilDataComponentType.AirQualitySensor,
      CivilDataComponentType.TemperatureSensor,
      CivilDataComponentType.VibrationSensor,
      CivilDataComponentType.TrafficSensor,
      CivilDataComponentType.TrafficCamera,
    ];
    const loads: any = [];
    typeIndex.forEach((type) => {
      loads.push(imageElementFromUrl(CivilDataModel.getIconForComponent(type)));
    });
    await (this._loading = Promise.all(loads)); // this is a member so we can tell if we're still loading
    for (const img of loads) {
      const image = await img;
      this._images.push(image);
    }
    this._loading = undefined;

    sensors.forEach((component) => {
      if (component.position === undefined ||
        (component.position.x === 0 &&
          component.position.y === 0 &&
          component.position.z === 0)) {
        // tslint:disable-next-line: no-console
        console.log("Missing position for element id: " + component.id);
      } else {
        let index = 0;
        typeIndex.forEach((type) => {
          if (component.type === type)
            this.addMarker(component, this._images[index]!,
              (featuredSensorId !== undefined && component.id === featuredSensorId));
          else
            index = index + 1;
        });
      }
    });
  }

  private addMarker(component: CivilComponentProps, image: HTMLImageElement, isFeatured: boolean) {
    const marker = new SensorMarker(component, image, isFeatured);
    this._markerSet.markers.add(marker);
  }

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. We add the MarkerSet. */
  public decorate(context: DecorateContext): void {
    if (undefined !== this._loading) return;
    if (context.viewport.view.isSpatialView())
      this._markerSet.addDecoration(context);
  }

  /** Show markers (clear existing ones if any). */
  public static show(sensors: CivilComponentProps[], featuredSensorId?: string) {
    this.clear();
    // create the SensorMarkerSetDecoration object and add it as a ViewManager decorator.
    SensorMarkerSetDecoration.decorator = new SensorMarkerSetDecoration(sensors, featuredSensorId);
    IModelApp.viewManager.addDecorator(SensorMarkerSetDecoration.decorator!);
  }

  /** Stop showing markers if currently active. */
  public static clear() {
    if (undefined === SensorMarkerSetDecoration.decorator) return;
    IModelApp.viewManager.dropDecorator(SensorMarkerSetDecoration.decorator);
    SensorMarkerSetDecoration.decorator._markerSet.markers.forEach((marker: SensorMarker) => marker.endSensorDataPolling());
    SensorMarkerSetDecoration.decorator._markerSet.markers.clear();
    SensorMarkerSetDecoration.decorator = undefined;
  }

  /** Toggle display of markers on and off. */
  public static toggle(sensors: CivilComponentProps[]) {
    if (undefined === SensorMarkerSetDecoration.decorator)
      return this.show(sensors);
    this.clear();
  }
}
