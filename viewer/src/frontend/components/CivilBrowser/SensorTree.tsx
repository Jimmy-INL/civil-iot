/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { ITreeDataProvider, TreeNodeItem } from "@bentley/ui-components";
import { CivilDataModel, CivilComponentProps } from "../../api/CivilDataModel";
import { AbstractCivilTree, createCivilComponentTreeNode } from "./AbstractCivilTree";

interface SensorTreeProps {
  onNodeSelected(component: CivilComponentProps | undefined): void;
  filterBy?: CivilComponentProps;
}

export function SensorTree(props: SensorTreeProps) {
  const dataProvider = React.useMemo(() => new SensorDataProvider(props.filterBy), []);
  return AbstractCivilTree({ dataProvider, ...props });
}

class SensorDataProvider implements ITreeDataProvider {
  private filterBy?: CivilComponentProps;

  constructor(filterBy?: CivilComponentProps) {
    this.filterBy = filterBy;
  }

  private getFilteredSensorList() {
    const data = CivilDataModel.get();
    const sensors = data.getAllSensors();

    if (undefined === this.filterBy)
      return sensors;

    return sensors;
  }

  public async getNodesCount(_parent?: TreeNodeItem) {
    return this.getFilteredSensorList().length;
  }

  public async getNodes(_parent?: TreeNodeItem) {
    const components = this.getFilteredSensorList();

    components.sort((a: CivilComponentProps, b: CivilComponentProps) => {
      if (a.type === b.type)
        if (a.label === b.label)
          return 0;
        else
          return a.label < b.label ? -1 : 1;

      return a.type < b.type ? -1 : 1;
    });

    const nodes = [];
    for (const component of components) {
      nodes.push(createCivilComponentTreeNode(component, false));
    }

    return nodes;
  }
}
