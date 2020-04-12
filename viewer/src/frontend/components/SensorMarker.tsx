/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
 * Licensed under the MIT License. See LICENSE.md in the project root for license terms.
 *--------------------------------------------------------------------------------------------*/
import {
  IModelApp,
  Marker,
  BeButtonEvent,
  Cluster,
  MarkerSet,
  DecorateContext,
  BeButton,
  imageElementFromUrl,
} from "@bentley/imodeljs-frontend";
import { ColorDef } from "@bentley/imodeljs-common";
import { XYAndZ, XAndY } from "@bentley/geometry-core";
import { CivilDataComponentType, CivilDataModel } from "../api/CivilDataModel";

// const STATUS_TO_STRING = ["High", "Medium", "Normal"];

// const STATUS_COUNT = 3;
const IMAGE_SIZE = 30;
const MIN_CLUSTER_SIZE = 2;

/** Marker to show a saved view camera location. */
export class SensorMarker extends Marker {
  protected _component: any;
  protected _image: HTMLImageElement;

  public get status(): number {
    return 0; // this._component.status;
  }
  public get markerImage(): HTMLImageElement {
    return this._image;
  }

  /** Create a new SensorMarker */
  constructor(public component: any, image: HTMLImageElement) {
    super(
      {
        x: component.position.x,
        y: component.position.y,
        z: component.position.z,
      },
      { x: IMAGE_SIZE, y: IMAGE_SIZE },
    );

    this._image = image;
    this.setImage(image);

    // let title = "";
    // title +=
    //   "<b>Id:</b> " +
    //   component.elementId +
    //   ", <b>Class:</b> " +
    //   component.className +
    //   "<br>";
    // const maxlen: number = 60;
    // if (component.description.length > maxlen)
    //   title +=
    //     "<b>Desc:</b> " +
    //     component.description.substring(0, maxlen) +
    //     "...<br>";
    // else title += "<b>Desc:</b> " + component.description + "<br>";
    // title += "<b>Status: </b>" + STATUS_TO_STRING[component.status] + "<br>";
    // const div = document.createElement("div");
    // div.innerHTML = title;
    // this.title = div;

    this.setScaleFactor({ low: 0.2, high: 1.4 }); // make size 20% at back of frustum and 140% at front of frustum (if camera is on)
    this._component = component;
  }

  public onMouseButton(ev: BeButtonEvent): boolean {
    if (
      BeButton.Data !== ev.button ||
      !ev.isDown ||
      !ev.viewport ||
      !ev.viewport.view.isSpatialView()
    )
      return true;
    ev.viewport!.iModel.selectionSet.replace(this._component.elementId);
    return true; // Don't allow clicks to be sent to active tool...
  }
}

/** A Marker used to show a cluster of saved views. */
class SensorClusterMarker extends Marker {
  private _cluster: Cluster<SensorMarker>;
  private _maxStatus: number = 100;
  // RGB values for:  red orange green light-green
  private _colors: string[] = ["#C00000", "#ED7D31", "#92D050", "#00B050"];

  /** Create a new cluster marker */
  constructor(location: XYAndZ, size: XAndY, cluster: Cluster<SensorMarker>) {
    super(location, size);

    this._cluster = cluster;
    this._cluster.markers.forEach((marker) => {
      if (marker.status < this._maxStatus) this._maxStatus = marker.status;
    });
    this.label = cluster.markers.length.toLocaleString();
    this.labelColor = this._colors[this._maxStatus];
    this.labelFont = "bold 16px san-serif";
    // let title = "";
    // const statusCounts: number[] = new Array<number>();
    // for (let i: number = 0; i < STATUS_COUNT; i++) statusCounts[i] = 0;
    // cluster.markers.forEach((marker) => {
    //   statusCounts[marker.status]++;
    // });

    // title += "<table><caption><b>Status:</b></caption>";
    // for (let i: number = 0; i < STATUS_COUNT; i++) {
    //   if (statusCounts[i])
    //     title +=
    //       "<tr><td>" +
    //       STATUS_TO_STRING[i] +
    //       "</td><td><b>" +
    //       statusCounts[i] +
    //       "<b></td></tr>";
    // }
    // title += "</table>";

    const div = document.createElement("div");
    // div.innerHTML = title;
    this.title = div;
  }

  /** Show the cluster as a white circle with an outline */
  public drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = this._colors[this._maxStatus];
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
    const elementIds: any = [];
    this._cluster.markers.forEach((marker) => {
      elementIds.push(marker.component.elementId);
    });
    const vp = ev.viewport;
    if (0 < elementIds.length && vp) {
      vp.iModel.selectionSet.replace(elementIds);
      // tslint:disable-next-line: no-floating-promises
      vp.zoomToElements(elementIds, { animateFrustumChange: true });
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

  public constructor(sensors: any[]) {
    this.loadAll(sensors); // tslint:disable-line: no-floating-promises
  }

  private recolorImage(img: any) {

    const canvasOut = document.createElement("canvas");
    const ctx = canvasOut.getContext("2d");
    if (!ctx) return;
    const w = img.width;
    const h = img.height;

    canvasOut.width = w;
    canvasOut.height = h;

    // Check if we need to change the color from black to white
    const vp = IModelApp.viewManager.selectedView!;
    if (ColorDef.black === vp.getContrastToBackgroundColor())
      return;

    // draw the image on the temporary canvas
    ctx.drawImage(img, 0, 0, w, h);

    // pull the entire image into an array of pixel data
    const imageData = ctx.getImageData(0, 0, w, h);

    // flip every pixel,
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255 - imageData.data[i];
      imageData.data[i + 1] = 255 - imageData.data[i + 1];
      imageData.data[i + 2] = 255 - imageData.data[i + 2];
      imageData.data[i + 3] = 255;
    }
    // put the altered data back on the canvas
    ctx.putImageData(imageData, 0, 0);
  }

  // load all images. After they're loaded, make the incident markers
  private async loadAll(sensors: any[]) {
    const typeIndex = [
      CivilDataComponentType.AirQualitySensor,
      CivilDataComponentType.TemperatureSensor,
      CivilDataComponentType.VibrationSensor,
      CivilDataComponentType.TrafficSensor,
    ];
    const loads: any = [];
    typeIndex.forEach((type) => {
      loads.push(imageElementFromUrl(CivilDataModel.getIconForComponent(type)));
    });
    await (this._loading = Promise.all(loads)); // this is a member so we can tell if we're still loading
    for (const img of loads) {
      const imageIn = await img;

      const image = new Image();
      image.onload = () => this.recolorImage(imageIn);
      image.src = imageIn.src;
      this._images.push(image);
    }
    this._loading = undefined;

    sensors.forEach((component) => {
      if (component.position === undefined ||
         (component.position.x === 0 &&
          component.position.y === 0 &&
          component.position.z === 0)) {
        // tslint:disable-next-line: no-console
        console.log("Missing position for element id: " + component.elementId);
      } else {
        let index = 0;
        typeIndex.forEach((type) => {
          if (component.type === type)
            this.addMarker(component, this._images[index]);
          else
            index = index + 1;
        });
      }
    });
  }

  private addMarker(component: any, image: any) {
    const marker = new SensorMarker(component, image);
    this._markerSet.markers.add(marker);
  }

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. We add the MarkerSet. */
  public decorate(context: DecorateContext): void {
    if (undefined !== this._loading) return;
    if (context.viewport.view.isSpatialView())
      this._markerSet.addDecoration(context);
  }

  /** Start showing markers if not currently active. */
  public static async show(sensors: any[]): Promise<void> {
    if (undefined !== SensorMarkerSetDecoration.decorator) return;

    // start by creating the SensorMarkerSetDecoration object and adding it as a ViewManager decorator.
    SensorMarkerSetDecoration.decorator = new SensorMarkerSetDecoration(sensors);
    IModelApp.viewManager.addDecorator(SensorMarkerSetDecoration.decorator!);
  }

  /** Stop showing markers if currently active. */
  public static clear() {
    if (undefined === SensorMarkerSetDecoration.decorator) return;
    IModelApp.viewManager.dropDecorator(SensorMarkerSetDecoration.decorator!);
    SensorMarkerSetDecoration.decorator = undefined;
  }

  /** Toggle display of markers on and off. */
  public static async toggle(sensors: any[]): Promise<void> {
    if (undefined === SensorMarkerSetDecoration.decorator)
      return this.show(sensors);
    this.clear();
  }

  /** Update markers from current sensors if currently displayed. */
  public static async refresh(sensors: any[]): Promise<void> {
    if (undefined === SensorMarkerSetDecoration.decorator) return;
    this.clear();
    return this.show(sensors);
  }
}
