import {
  ApartmentOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LineHeightOutlined,
  MenuOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { Graph } from '@antv/x6';
import '@antv/x6-react-shape';
import { SchemaOptionsContext } from '@formily/react';
import {
  APIClientProvider,
  CollectionCategroriesContext,
  CollectionCategroriesProvider,
  CollectionManagerContext,
  CollectionManagerProvider,
  CurrentAppInfoContext,
  SchemaComponent,
  SchemaComponentOptions,
  Select,
  collection,
  css,
  cx,
  useAPIClient,
  useCollectionManager,
  useCompile,
  useCurrentAppInfo,
  useGlobalTheme,
} from '@nocobase/client';
import lodash from 'lodash';
import { useFullscreen } from 'ahooks';
import { Button, ConfigProvider, Input, Layout, Menu, Popover, Switch, Tooltip } from 'antd';
import dagre from 'dagre';
import React, { createContext, forwardRef, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useAsyncDataSource, useCreateActionAndRefreshCM } from './action-hooks';
import { AddCollectionAction } from './components/AddCollectionAction';
import Entity from './components/Entity';
import { SimpleNodeView } from './components/ViewNode';
import useStyles from './style';
import {
  formatData,
  getChildrenCollections,
  getDiffEdge,
  getDiffNode,
  getInheritCollections,
  getPopupContainer,
  useGCMTranslation,
} from './utils';

const { drop, groupBy, last, maxBy, minBy, take } = lodash;

const LINE_HEIGHT = 40;
const NODE_WIDTH = 250;
let targetGraph;
let targetNode;
const dir = 'TB'; // LR RL TB BT 横排

export enum DirectionType {
  Both = 'both',
  Target = 'target',
  Source = 'source',
}

export enum ConnectionType {
  Both = 'both',
  Inherit = 'inherited',
  Entity = 'entity',
}
const getGridData = (num, arr) => {
  const newArr = [];
  while (arr.length > 0 && num) {
    newArr.push(arr.splice(0, num));
  }
  return newArr;
};

//初始布局
async function layout(createPositions) {
  const { positions } = targetGraph;
  let graphPositions = [];
  const nodes: any[] = targetGraph.getNodes();
  const edges = targetGraph.getEdges();
  const g: any = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 50, edgesep: 50, rankSep: 50, align: 'DL', controlPoints: true });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((node, i) => {
    const width = NODE_WIDTH;
    const height = node.getPorts().length * 32 + 30;
    g.setNode(node.id, { width, height });
  });
  dagre.layout(g);
  targetGraph.freeze();
  const dNodes = getGridData(15, g.nodes());
  dNodes.forEach((arr, row) => {
    arr.forEach((id, index) => {
      const node = targetGraph.getCell(id);
      const col = index % 15;
      if (node) {
        const targetPosition =
          (positions &&
            positions.find((v) => {
              return v.collectionName === node.store.data.name;
            })) ||
          {};
        const calculatedPosition = { x: col * 325 + 50, y: row * 400 + 60 };
        node.position(targetPosition.x || calculatedPosition.x, targetPosition.y || calculatedPosition.y);
        if (positions && !positions.find((v) => v.collectionName === node.store.data.name)) {
          // 位置表中没有的表都自动保存
          graphPositions.push({
            collectionName: node.store.data.name,
            x: calculatedPosition.x,
            y: calculatedPosition.y,
          });
        }
      }
    });
  });
  edges.forEach((edge) => {
    optimizeEdge(edge);
  });
  targetGraph.unfreeze();
  if (targetNode) {
    typeof targetNode === 'string'
      ? targetGraph.positionCell(last(nodes), 'top', { padding: 100 })
      : targetGraph.positionCell(targetNode, 'top', { padding: 100 });
  } else {
    targetGraph.positionCell(nodes[0], 'top-left', { padding: 100 });
  }
  if (graphPositions.length > 0) {
    await createPositions(graphPositions);
    graphPositions = [];
  }
}

function optimizeEdge(edge) {
  const {
    store: {
      data: { connectionType },
    },
  } = edge;
  const source = edge.getSource();
  const target = edge.getTarget();
  const sorceNodeX = targetGraph.getCell(source.cell).position().x;
  const targeNodeX = targetGraph.getCell(target.cell).position().x;
  const leftAnchor = connectionType
    ? {
        name: 'topLeft',
        args: {
          dy: -20,
        },
      }
    : {
        name: 'left',
      };
  const rightAnchor = connectionType
    ? {
        name: 'topRight',
        args: {
          dy: -20,
        },
      }
    : 'right';
  const router = connectionType ? 'normal' : 'er';
  const vertices = edge.getVertices();
  vertices.forEach(() => {
    return edge.removeVertexAt(0);
  });
  if (sorceNodeX - 100 > targeNodeX) {
    edge.setSource({
      cell: source.cell,
      port: source.port,
      anchor: leftAnchor,
    });
    edge.setTarget({
      cell: target.cell,
      port: target.port,
      anchor: rightAnchor,
    });
    edge.setRouter(router, {
      direction: 'H',
    });
  } else if (Math.abs(sorceNodeX - targeNodeX) < 100) {
    const sourceCell = targetGraph.getCell(source.cell);
    const targetCell = targetGraph.getCell(target.cell);
    edge.setSource({
      cell: source.cell,
      port: source.port,
      anchor: leftAnchor,
    });
    edge.setTarget({
      cell: target.cell,
      port: target.port,
      anchor: leftAnchor,
    });
    if (connectionType) {
      edge.setVertices([
        { x: sourceCell.position().x - 30, y: sourceCell.position().y + 20 },
        { x: targetCell.position().x - 30, y: targetCell.position().y + 20 },
      ]);
      edge.setRouter('normal');
    } else {
      edge.setRouter('oneSide', { side: 'left' });
    }
  } else {
    edge.setSource({
      cell: source.cell,
      port: source.port,
      anchor: rightAnchor,
    });
    edge.setTarget({
      cell: target.cell,
      port: target.port,
      anchor: leftAnchor,
    });
    edge.setRouter(router, {
      direction: 'H',
    });
  }
}

function getNodes(nodes) {
  targetGraph.addNodes(nodes);
}

function getEdges(edges) {
  edges.forEach((item) => {
    if (item.source && item.target) {
      targetGraph.addEdge({
        ...item,
        connector: {
          name: 'normal',
          zIndex: 1000,
        },
      });
    }
  });
}

const CollapsedContext = createContext<any>({});
const formatNodeData = () => {
  const layoutNodes = [];
  const edges = targetGraph.getEdges();
  const nodes = targetGraph.getNodes();
  edges.forEach((edge) => {
    layoutNodes.push(edge.getSourceCellId());
    layoutNodes.push(edge.getTargetCellId());
  });
  const nodeGroup = groupBy(nodes, (v) => {
    if (layoutNodes.includes(v.id)) {
      return 'linkNodes';
    } else {
      return 'rawNodes';
    }
  });
  return nodeGroup;
};
//自动布局
const handelResetLayout = () => {
  const { linkNodes = [], rawNodes } = formatNodeData();
  const { positions } = targetGraph;
  const nodes = linkNodes.concat(rawNodes);
  const edges = targetGraph.getEdges();
  const g = new dagre.graphlib.Graph();
  let alternateNum;
  let rawEntity;
  let num;
  let minX;
  let maxY;
  const updatePositionData = [];
  g.setGraph({ rankdir: 'TB', nodesep: 50, edgesep: 50, rankSep: 50, align: 'DL', controlPoints: true });
  const width = 250;
  const height = 400;
  nodes.forEach((node) => {
    g.setNode(node.id, { width, height });
  });
  edges.forEach((edge) => {
    const source = edge.getSource();
    const target = edge.getTarget();
    g.setEdge(source.cell, target.cell, {});
  });
  dagre.layout(g);
  targetGraph.freeze();
  const gNodes = g.nodes();
  const nodeWithEdges = take(gNodes, linkNodes.length);
  const nodeWithoutEdges = drop(gNodes, linkNodes.length);
  nodeWithEdges.forEach((id) => {
    const node = targetGraph.getCell(id);
    const positionId = positions.find((v) => v.collectionName === node.id)?.id;
    if (node) {
      const pos = g.node(id);
      updatePositionData.push({ id: positionId, x: pos.x, y: pos.y });
      node.position(pos?.x, pos?.y);
    }
  });
  if (nodeWithEdges.length) {
    maxY = targetGraph
      .getCellById(
        maxBy(nodeWithEdges, (k) => {
          return targetGraph.getCellById(k).position().y;
        }),
      )
      .position().y;
    minX = targetGraph
      .getCellById(
        minBy(nodeWithEdges, (k) => {
          return targetGraph.getCellById(k).position().x;
        }),
      )
      .position().x;
    const maxX = targetGraph
      .getCellById(
        maxBy(nodeWithEdges, (k) => {
          return targetGraph.getCellById(k).position().x;
        }),
      )
      .position().x;
    const yNodes = nodeWithEdges.filter((v) => {
      return Math.abs(targetGraph.getCellById(v).position().y - maxY) < 50;
    });
    const referenceNode: any = targetGraph
      .getCell(maxBy(yNodes, (k) => targetGraph.getCellById(k).position().x))
      ?.position();
    num = Math.round(maxX / 320) || 1;
    alternateNum = Math.floor((4500 - (maxX + 100 - referenceNode.x)) / 280);
    rawEntity = getGridData(num, rawNodes);
    if (alternateNum >= 1) {
      const alternateNodes = take(nodeWithoutEdges, alternateNum);
      rawEntity = getGridData(num, drop(nodeWithoutEdges, alternateNum));
      alternateNodes.forEach((id, index) => {
        const node = targetGraph.getCell(id);
        if (node) {
          const calculatedPosition = { x: referenceNode.x + 320 * index + 280, y: referenceNode.y };
          node.position(calculatedPosition.x, calculatedPosition.y);
          const positionId = positions.find((v) => v.collectionName === node.id)?.id;
          updatePositionData.push({ id: positionId, x: calculatedPosition.x, y: calculatedPosition.y });
        }
      });
    }
  } else {
    num = 15;
    alternateNum = 0;
    rawEntity = getGridData(15, rawNodes);
    minX = 50;
    maxY = 50;
  }
  rawEntity.forEach((arr, row) => {
    arr.forEach((id, index) => {
      const node = targetGraph.getCell(id);
      const col = index % num;
      if (node) {
        const calculatedPosition = { x: col * 325 + minX, y: row * 300 + maxY + 300 };
        node.position(calculatedPosition.x, calculatedPosition.y);
        const positionId = positions.find((v) => v.collectionName === node.id)?.id;
        updatePositionData.push({ id: positionId, x: calculatedPosition.x, y: calculatedPosition.y });
      }
    });
  });
  edges.forEach((edge) => {
    optimizeEdge(edge);
  });
  targetGraph.unfreeze();
  targetGraph.positionCell(nodes[0], 'top-left', { padding: 100 });
  targetGraph.updatePositionAction(updatePositionData, true);
};

export const GraphDrawPage = React.memo(() => {
  const { theme } = useGlobalTheme();
  const { styles } = useStyles();
  const options = useContext(SchemaOptionsContext);
  const ctx = useContext(CollectionManagerContext);
  const api = useAPIClient();
  const compile = useCompile();
  const { t } = useGCMTranslation();
  const [collectionData, setCollectionData] = useState<any>([]);
  const [collectionList, setCollectionList] = useState<any>([]);
  const { refreshCM } = useCollectionManager();
  const currentAppInfo = useCurrentAppInfo();
  const {
    data: { database },
  } = currentAppInfo;
  const categoryCtx = useContext(CollectionCategroriesContext);
  const scope = { ...options?.scope };
  const components = { ...options?.components };
  const useSaveGraphPositionAction = async (data) => {
    await api.resource('graphPositions').create({ values: data });
    await refreshPositions();
  };
  const useUpdatePositionAction = async (data, isbatch = false) => {
    if (isbatch) {
      await api.resource('graphPositions').update({
        values: data,
      });
    } else {
      await api.resource('graphPositions').update({
        filter: { collectionName: data.collectionName },
        values: { ...data },
      });
    }
    await refreshPositions();
  };
  const refreshPositions = async () => {
    const { data } = await api.resource('graphPositions').list({ paginate: false });
    targetGraph.positions = data.data;
    return Promise.resolve();
  };
  const setTargetNode = (node) => {
    targetNode = node;
    if (node === 'destory') {
      refreshPositions();
    }
  };
  const refreshGM = async () => {
    const data = await refreshCM();
    targetGraph.collections = data;
    targetGraph.updatePositionAction = useUpdatePositionAction;
    const currentNodes = targetGraph.getNodes();
    setCollectionData(data);
    setCollectionList(data);
    if (!currentNodes.length) {
      renderInitGraphCollection(data);
    } else {
      renderDiffGraphCollection(data);
    }
  };
  const initGraphCollections = () => {
    targetGraph = new Graph({
      container: document.getElementById('container')!,
      moveThreshold: 0,
      scroller: {
        enabled: true,
        pannable: true,
        padding: { top: 0, left: 500, right: 300, bottom: 400 },
      },
      selecting: {
        enabled: false,
        multiple: true,
        rubberband: true,
        movable: true,
        className: 'node-selecting',
        modifiers: 'shift',
      },
      minimap: {
        enabled: true,
        container: document.getElementById('graph-minimap'),
        width: 300,
        height: 250,
        padding: 10,
        graphOptions: {
          async: true,
          getCellView(cell) {
            if (cell.isNode()) {
              return SimpleNodeView;
            }
          },
          createCellView(cell) {
            if (cell.isEdge()) {
              return null;
            }
          },
        },
      },
      connecting: {
        anchor: {
          name: 'midSide',
        },
      },
      mousewheel: {
        enabled: true,
        modifiers: ['ctrl', 'meta'],
      },
      snapline: {
        enabled: !0,
      },
      keyboard: {
        enabled: false,
      },
      clipboard: {
        enabled: false,
      },
      interacting: {
        magnetConnectable: false,
      },
      async: true,
      preventDefaultBlankAction: true,
    });
    targetGraph.connectionType = ConnectionType.Both;
    targetGraph.direction = DirectionType.Target;
    targetGraph.cacheCollection = {};
    Graph.registerPortLayout(
      'erPortPosition',
      (portsPositionArgs) => {
        return portsPositionArgs.map((_, index) => {
          return {
            position: {
              x: 0,
              y: (index + 1) * LINE_HEIGHT,
            },
            angle: 0,
          };
        });
      },
      true,
    );
    Graph.registerNode(
      'er-rect',
      {
        inherit: 'react-shape',
        component: (node) => (
          <CurrentAppInfoContext.Provider value={currentAppInfo}>
            <APIClientProvider apiClient={api}>
              <SchemaComponentOptions inherit scope={scope} components={components}>
                <CollectionCategroriesProvider {...categoryCtx}>
                  <CollectionManagerProvider
                    collections={targetGraph?.collections}
                    refreshCM={refreshGM}
                    interfaces={ctx.interfaces}
                  >
                    {/* TODO: 因为画布中的卡片是一次性注册进 Graph 的，这里的 theme 是存在闭包里的，因此当主题动态变更时，并不会触发卡片的重新渲染 */}
                    <ConfigProvider theme={theme}>
                      <div style={{ height: 'auto' }}>
                        <Entity node={node} setTargetNode={setTargetNode} targetGraph={targetGraph} />
                      </div>
                    </ConfigProvider>
                  </CollectionManagerProvider>
                </CollectionCategroriesProvider>
              </SchemaComponentOptions>
            </APIClientProvider>
          </CurrentAppInfoContext.Provider>
        ),
        ports: {
          groups: {
            list: {
              markup: [
                {
                  tagName: 'rect',
                  selector: 'portBody',
                },
              ],
              attrs: {
                portBody: {
                  width: NODE_WIDTH,
                  height: LINE_HEIGHT,
                  strokeWidth: 1,
                  // magnet: true,
                  visibility: 'hidden',
                },
              },
              position: 'erPortPosition',
            },
          },
        },
        body: {
          refWidth: 100,
          refHeight: 100,
        },
      },
      true,
    );
    targetGraph.on('edge:mouseleave', ({ e, edge: targetEdge }) => {
      e.stopPropagation();
      handleEdgeUnActive(targetEdge);
    });
    targetGraph.on('node:moved', ({ e, node }) => {
      e.stopPropagation();
      const connectEdges = targetGraph.getConnectedEdges(node);
      const currentPosition = node.position();
      const oldPosition = targetGraph.positions.find((v) => v.collectionName === node.store.data.name);
      if (oldPosition) {
        (oldPosition.x !== currentPosition.x || oldPosition.y !== currentPosition.y) &&
          useUpdatePositionAction({
            collectionName: node.store.data.name,
            ...currentPosition,
          });
      } else {
        useSaveGraphPositionAction({
          collectionName: node.store.data.name,
          ...currentPosition,
        });
      }
      connectEdges.forEach((edge) => {
        optimizeEdge(edge);
      });
    });
    targetGraph.on('cell:mouseenter', ({ e, cell, edge }) => {
      e.stopPropagation();
      cell.toFront();
      if (edge) {
        handleEdgeActive(edge);
      }
    });
    targetGraph.on('blank:click', (e) => {
      if (targetGraph?.activeEdge) {
        handleEdgeUnActive(targetGraph?.activeEdge);
      }
      targetGraph.collapseNodes?.map((v) => {
        const node = targetGraph.getCell(Object.keys(v)[0]);
        Object.values(v)[0] && node.setData({ collapse: false });
      });
      targetGraph.cleanSelection();
    });
    targetGraph.on('node:selected', ({ e, node }) => {
      node.setProp({ select: true });
    });
    targetGraph.on('node:unselected', ({ e, node }) => {
      node.setProp({ select: false });
    });
  };

  const handleEdgeUnActive = (targetEdge) => {
    targetGraph.activeEdge = null;
    const { m2m, connectionType } = targetEdge.store?.data;
    const m2mLineId = m2m?.find((v) => v !== targetEdge.id);
    const m2mEdge = targetGraph.getCellById(m2mLineId);
    const lightsOut = (edge) => {
      const targeNode = targetGraph.getCellById(edge.store.data.target.cell);
      const sourceNode = targetGraph.getCellById(edge.store.data.source.cell);
      targeNode.setProp({ targetPort: false, associated: null });
      sourceNode.setProp({ sourcePort: false, associated: null });
      edge.setAttrs({
        line: {
          stroke: '#ddd',
          targetMarker: connectionType === ConnectionType.Inherit ? { name: 'classic', fill: '#ddd' } : null,
        },
      });
      edge.setLabels(
        edge.getLabels().map((v) => {
          return {
            ...v,
            attrs: {
              labelText: {
                ...v.attrs.labelText,
                fill: 'rgba(0, 0, 0, 0.3)',
              },
              labelBody: {
                ...v.attrs.labelBody,
                stroke: '#ddd',
              },
            },
          };
        }),
      );
    };
    lightsOut(targetEdge);
    m2mEdge && lightsOut(m2mEdge);
  };
  const handleEdgeActive = (targetEdge) => {
    targetGraph.activeEdge = targetEdge;
    const { associated, m2m, connectionType } = targetEdge.store?.data;
    const m2mLineId = m2m?.find((v) => v !== targetEdge.id);
    const m2mEdge = targetGraph.getCellById(m2mLineId);
    const lightUp = (edge) => {
      edge.toFront();
      edge.setAttrs({
        line: {
          stroke: '#1890ff',
          strokeWidth: 1,
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          sourceMarker: null,
          targetMarker: connectionType === ConnectionType.Inherit ? { name: 'classic', fill: '#1890ff' } : null,
        },
      });
      edge.setLabels(
        edge.getLabels().map((v) => {
          return {
            ...v,
            attrs: {
              labelText: {
                ...v.attrs.labelText,
                fill: '#1890ff',
              },
              labelBody: {
                ...v.attrs.labelBody,

                stroke: '#1890ff',
              },
            },
          };
        }),
      );
      const targeNode = targetGraph.getCellById(edge.store.data.target.cell);
      const sourceNode = targetGraph.getCellById(edge.store.data.source.cell);
      targeNode.toFront();
      sourceNode.toFront();
      targeNode.setProp({
        targetPort: edge.store.data.target.port,
        associated,
      });
      sourceNode.setProp({
        sourcePort: edge.store.data.source.port,
        associated,
      });
    };
    lightUp(targetEdge);
    m2mEdge && lightUp(m2mEdge);
  };
  // 首次渲染
  const renderInitGraphCollection = (rawData) => {
    const { nodesData, edgesData, inheritEdges } = formatData(rawData);
    targetGraph.data = { nodes: nodesData, edges: edgesData };
    getNodes(nodesData);
    getEdges(edgesData);
    getEdges(inheritEdges);
    layout(useSaveGraphPositionAction);
  };

  // 增量渲染
  const renderDiffGraphCollection = (rawData) => {
    const { positions }: { positions: { x: number; y: number }[] } = targetGraph;
    const { nodesData, edgesData, inheritEdges } = formatData(rawData);
    const currentNodes = targetGraph.getNodes().map((v) => v.store.data);
    const totalEdges = targetGraph.getEdges().map((v) => v.store.data);
    const currentEdgesGroup = groupBy(totalEdges, (v) => {
      if (v.connectionType) {
        return 'currentInheritEdges';
      } else {
        return 'currentRelateEdges';
      }
    });
    const diffNodes = getDiffNode(nodesData, currentNodes);
    const diffEdges = getDiffEdge(edgesData, currentEdgesGroup.currentRelateEdges || []);
    const diffInheritEdge = getDiffEdge(inheritEdges, currentEdgesGroup.currentInheritEdges || []);
    diffNodes.forEach(({ status, node, port }) => {
      const updateNode = targetGraph.getCellById(node.id);
      switch (status) {
        case 'add':
          const maxY = maxBy(positions, 'y').y;
          const yNodes = positions.filter((v) => {
            return Math.abs(v.y - maxY) < 100;
          });
          let referenceNode: any = maxBy(yNodes, 'x');
          let position;
          if (referenceNode.x > 4500) {
            const minX = minBy(positions, 'x').x;
            referenceNode = minBy(yNodes, 'x');
            position = { x: minX, y: referenceNode.y + 400 };
          } else {
            position = { x: referenceNode.x + 350, y: referenceNode.y };
          }
          targetNode = targetGraph.addNode({
            ...node,
            position,
          });
          useSaveGraphPositionAction({
            collectionName: node.name,
            ...position,
          });
          targetGraph && targetGraph.positionCell(targetNode, 'top', { padding: 200 });
          break;
        case 'insertPort':
          updateNode.insertPort(port.index, port.port);
          break;
        case 'deletePort':
          updateNode.removePort(port.id);
          break;
        case 'updateNode':
          updateNode.setProp({ title: node.title });
          break;
        case 'delete':
          targetGraph.removeCell(node.id);
        default:
          return null;
      }
    });
    const renderDiffEdges = (data) => {
      data.forEach(({ status, edge }) => {
        switch (status) {
          case 'add':
            const newEdge = targetGraph.addEdge({
              ...edge,
            });
            optimizeEdge(newEdge);
            break;
          case 'delete':
            targetGraph.removeCell(edge.id);
            break;
          default:
            return null;
        }
      });
    };
    setTimeout(() => {
      renderDiffEdges(diffEdges.concat(diffInheritEdge));
    });
  };

  const handleSearchCollection = (e) => {
    const value = e.target.value.toLowerCase();
    if (value) {
      const targetCollections = collectionData.filter((v) => {
        const collectionTitle = compile(v.title).toLowerCase();
        return collectionTitle.includes(value);
      });
      setCollectionList(targetCollections);
    } else {
      setCollectionList(collectionData);
    }
  };

  // 处理不同方向的继承关系表
  const hanleHighlightInheritedNode = (key, direction) => {
    if (direction === DirectionType.Target) {
      const INodes = getInheritCollections(targetGraph.collections, key);
      INodes.forEach((v) => {
        targetGraph.getCellById(v)?.setAttrs({
          hightLight: true,
          direction,
          connectionType: ConnectionType.Inherit,
        });
      });
    } else {
      const INodes = getChildrenCollections(targetGraph.collections, key);
      INodes.forEach((v) => {
        targetGraph.getCellById(v.name)?.setAttrs({
          hightLight: true,
          direction,
          connectionType: ConnectionType.Inherit,
        });
      });
    }
  };

  // target index entity relation
  const handelTargetIndexEntity: any = (key) => {
    const node = targetGraph.getCellById(key);
    targetGraph.cacheCollection[key] = true;
    const connectedEdges = targetGraph.getConnectedEdges(node);
    const visibleEdges = connectedEdges.filter((v) => !v.store.data?.connectionType && v.getTargetCellId() === key);
    visibleEdges.forEach((v) => {
      if (v.store.data.m2m) {
        v.store.data.m2m.forEach((i) => {
          const m2mEdge = targetGraph.getCellById(i);
          if (m2mEdge.getTargetCellId() === key) {
            const sourceId = m2mEdge.getSourceCellId();
            const node = targetGraph.getCellById(sourceId);
            if (!node.store.data.attrs?.hightLight) {
              node.setAttrs({
                hightLight: true,
                direction: DirectionType.Target,
                connectionType: ConnectionType.Entity,
              });
              handelTargetIndexEntity(sourceId);
            }
          }
        });
      }
      const sourceId = v.getSourceCellId();
      const node = targetGraph.getCellById(sourceId);
      if (!node.store.data.attrs?.hightLight) {
        node.setAttrs({
          hightLight: true,
          direction: DirectionType.Target,
          connectionType: ConnectionType.Entity,
        });
        handelTargetIndexEntity(sourceId);
      }
    });
  };

  // source index entity relation
  const handelSourceIndexEntity: any = (key) => {
    const node = targetGraph.getCellById(key);
    const connectedEdges = targetGraph.getConnectedEdges(node);
    const visibleEdges = connectedEdges.filter((v) => !v.store.data?.connectionType && v.getSourceCellId() === key);
    visibleEdges.forEach((v) => {
      if (v.store.data.m2m) {
        v.store.data.m2m.forEach((i) => {
          const m2mEdge = targetGraph.getCellById(i);
          if (m2mEdge.getSourceCellId() === key) {
            const targetId = m2mEdge.getTargetCellId();
            const node = targetGraph.getCellById(targetId);
            if (!node.store.data.attrs?.hightLight) {
              node.setAttrs({
                hightLight: true,
                direction: DirectionType.Source,
                connectionType: ConnectionType.Entity,
              });
              handelSourceIndexEntity(targetId);
            }
          }
        });
      }
      const targetId = v.getTargetCellId();
      const node = targetGraph.getCellById(targetId);
      if (!node.store.data.attrs?.hightLight) {
        node.setAttrs({
          hightLight: true,
          direction: DirectionType.Source,
          connectionType: ConnectionType.Entity,
        });
        handelSourceIndexEntity(targetId);
      }
    });
  };

  // 处理不同方向的实体关系表
  const handleHighlightRelationNodes = (nodekey, direction) => {
    if (direction === DirectionType.Target) {
      handelTargetIndexEntity(nodekey);
    } else {
      handelSourceIndexEntity(nodekey);
    }
  };
  const handleCleanHighlight = (key?, currentDirection?, currentConnectionType?) => {
    const nodes = targetGraph.getNodes().filter((v) => v.store.data.attrs?.hightLight);
    const length = nodes.length;
    for (let i = 0; i < length; i++) {
      const { direction, connectionType } = nodes[i].getAttrs();
      const filterFlag = nodes[i].id !== key;
      const directionFlag = key && targetGraph.filterConfig?.key === key ? direction !== currentDirection : true;
      const renltionshipFlag =
        key && targetGraph.filterConfig?.key === key ? connectionType !== currentConnectionType : true;
      if (nodes[i].id !== key) {
        setTimeout(() => {
          filterFlag &&
            (directionFlag || renltionshipFlag) &&
            nodes[i].setAttrs({
              hightLight: false,
            });
        }, 0);
      }
    }
  };

  const handleFiterCollections = (value) => {
    const { connectionType, direction, filterConfig } = targetGraph;
    const directionBothFlag1 = value === filterConfig?.key && direction === DirectionType.Both;
    const relationshipBothFlag =
      value === filterConfig?.key &&
      (connectionType === ConnectionType.Both || connectionType === filterConfig.connectionType);
    if (value) {
      (!directionBothFlag1 || !relationshipBothFlag) && handleCleanHighlight(value, direction, connectionType);
      targetNode = targetGraph.getCellById(value);
      targetGraph.positionCell(targetNode, 'center', { padding: 0 });
      targetNode.setAttrs({
        hightLight: true,
        connectionType: connectionType,
      });
      setTimeout(() => {
        if ([ConnectionType.Entity, ConnectionType.Both].includes(connectionType)) {
          if (direction === DirectionType.Both) {
            handleHighlightRelationNodes(value, DirectionType.Target);
            handleHighlightRelationNodes(value, DirectionType.Source);
          } else {
            direction === DirectionType.Target && handleHighlightRelationNodes(value, direction);
            direction === DirectionType.Source && handleHighlightRelationNodes(value, direction);
          }
        }
        if ([ConnectionType.Inherit, ConnectionType.Both].includes(connectionType)) {
          if (direction === DirectionType.Both) {
            hanleHighlightInheritedNode(value, DirectionType.Target);
            hanleHighlightInheritedNode(value, DirectionType.Source);
          } else {
            hanleHighlightInheritedNode(value, direction);
          }
        }
        targetGraph.filterConfig = {
          key: value,
          direction: direction,
          connectionType,
        };
      }, 0);
    } else {
      handleCleanHighlight();
    }
  };

  const handleSetRelationshipType = (type) => {
    handleSetEdgeVisible(type);
  };

  const handleSetEdgeVisible = (type) => {
    targetNode = null;
    const edges = targetGraph.getEdges();
    edges.forEach((v) => {
      const {
        store: {
          data: { connectionType },
        },
      } = v;
      if (type === ConnectionType.Entity) {
        if (connectionType) {
          v.setVisible(false);
        } else {
          v.setVisible(true);
        }
      } else if (type === ConnectionType.Inherit) {
        if (!connectionType) {
          v.setVisible(false);
        } else {
          v.setVisible(true);
        }
      } else {
        v.setVisible(true);
      }
    });
  };

  useLayoutEffect(() => {
    initGraphCollections();
    return () => {
      targetGraph.off('cell:mouseenter');
      targetGraph.off('edge:mouseleave');
      targetGraph.off('node:moved');
      targetGraph.off('blank:click');
      targetGraph = null;
      targetNode = null;
    };
  }, []);

  useEffect(() => {
    refreshPositions().then(() => {
      refreshGM();
    });
  }, []);
  const loadCollections = async () => {
    return targetGraph.collections?.map((collection: any) => ({
      label: compile(collection.title),
      value: collection.name,
    }));
  };
  return (
    <Layout>
      <div className={styles.graphCollectionContainerClass}>
        <CollectionManagerProvider collections={targetGraph?.collections} refreshCM={refreshGM}>
          <CollapsedContext.Provider value={{ collectionList, handleSearchCollection }}>
            <div className={cx(styles.collectionListClass)}>
              <SchemaComponent
                components={{
                  Select: (props) => (
                    <Select popupMatchSelectWidth={false} {...props} getPopupContainer={getPopupContainer} />
                  ),
                  AddCollectionAction,
                }}
                schema={{
                  type: 'void',
                  properties: {
                    block1: {
                      type: 'void',
                      'x-collection': 'collections',
                      'x-decorator': 'ResourceActionProvider',
                      'x-decorator-props': {
                        collection,
                        request: {
                          resource: 'collections',
                          action: 'list',
                          params: {
                            pageSize: 50,
                            filter: {
                              inherit: false,
                            },
                            sort: ['sort'],
                            appends: [],
                          },
                        },
                      },
                      properties: {
                        actions: {
                          type: 'void',
                          'x-component': 'ActionBar',
                          'x-component-props': {
                            style: {
                              fontSize: 16,
                            },
                          },
                          properties: {
                            create: {
                              type: 'void',
                              title: '{{ t("Create collection") }}',
                              'x-component': 'AddCollectionAction',
                              'x-component-props': {
                                type: 'primary',
                              },
                            },
                            fullScreen: {
                              type: 'void',
                              'x-component': 'Action',
                              'x-component-props': {
                                component: forwardRef(() => {
                                  const [isFullscreen, { toggleFullscreen }] = useFullscreen(
                                    document.getElementById('graph_container'),
                                  );
                                  return (
                                    <Tooltip title={t('Full Screen')} getPopupContainer={getPopupContainer}>
                                      <Button
                                        onClick={() => {
                                          toggleFullscreen();
                                        }}
                                      >
                                        {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                      </Button>
                                    </Tooltip>
                                  );
                                }),
                                useAction: () => {
                                  return {
                                    run() {},
                                  };
                                },
                              },
                            },
                            collectionList: {
                              type: 'void',
                              'x-component': function Com() {
                                const { handleSearchCollection, collectionList } = useContext(CollapsedContext);
                                const [selectedKeys, setSelectKey] = useState([]);
                                const content = (
                                  <div>
                                    <Input
                                      style={{ margin: '4px 0' }}
                                      bordered={false}
                                      placeholder={t('Collection Search')}
                                      onChange={handleSearchCollection}
                                    />
                                    <Menu
                                      selectedKeys={selectedKeys}
                                      selectable={true}
                                      className={css`
                                        .ant-menu-item {
                                          height: 32px;
                                          line-height: 32px;
                                        }
                                      `}
                                      style={{ maxHeight: '70vh', overflowY: 'auto', border: 'none' }}
                                      items={[
                                        { type: 'divider' },
                                        ...collectionList.map((v) => {
                                          return {
                                            key: v.name,
                                            label: compile(v.title),
                                            onClick: (e: any) => {
                                              if (e.key !== selectedKeys[0]) {
                                                setSelectKey([e.key]);
                                                handleFiterCollections(e.key);
                                              } else {
                                                targetGraph.filterConfig = null;
                                                handleFiterCollections(false);
                                                setSelectKey([]);
                                              }
                                            },
                                          };
                                        }),
                                      ]}
                                    />
                                  </div>
                                );
                                return (
                                  <Popover
                                    content={content}
                                    autoAdjustOverflow
                                    placement="bottomRight"
                                    trigger={['click']}
                                    getPopupContainer={getPopupContainer}
                                    overlayClassName={css`
                                      .ant-popover-inner-content {
                                        padding: 0;
                                      }
                                    `}
                                  >
                                    <Button>
                                      <MenuOutlined />
                                    </Button>
                                  </Popover>
                                );
                              },
                              'x-component-props': {
                                icon: 'MenuOutlined',
                                useAction: () => {
                                  return {
                                    run() {},
                                  };
                                },
                              },
                            },
                            autoLayout: {
                              type: 'void',
                              'x-component': 'Action',
                              'x-component-props': {
                                component: forwardRef(() => {
                                  return (
                                    <Tooltip title={t('Auto layout')} getPopupContainer={getPopupContainer}>
                                      <Button
                                        onClick={() => {
                                          handelResetLayout();
                                        }}
                                      >
                                        <ApartmentOutlined />
                                      </Button>
                                    </Tooltip>
                                  );
                                }),
                                useAction: () => {
                                  return {
                                    run() {},
                                  };
                                },
                              },
                            },
                            connectionType: {
                              type: 'void',
                              'x-component': () => {
                                const menuItems = [
                                  {
                                    key: ConnectionType.Both,
                                    label: 'All relationships',
                                  },
                                  {
                                    key: ConnectionType.Entity,
                                    label: 'Entity relationship only',
                                  },
                                  {
                                    key: ConnectionType.Inherit,
                                    label: 'Inheritance relationship only',
                                  },
                                ];
                                const content = (
                                  <div>
                                    <Menu
                                      defaultSelectedKeys={[ConnectionType.Both]}
                                      selectable={true}
                                      className={css`
                                        .ant-menu-item {
                                          height: 32px;
                                          line-height: 32px;
                                        }
                                      `}
                                      style={{ maxHeight: '70vh', overflowY: 'auto', border: 'none' }}
                                      items={[
                                        { type: 'divider' },
                                        ...menuItems.map((v) => {
                                          return {
                                            key: v.key,
                                            label: t(v.label),
                                            onClick: (e: any) => {
                                              targetGraph.connectionType = v.key;
                                              const { filterConfig } = targetGraph;
                                              filterConfig && handleFiterCollections(filterConfig.key);
                                              handleSetRelationshipType(v.key);
                                            },
                                          };
                                        }),
                                      ]}
                                    />
                                  </div>
                                );
                                return (
                                  <Popover
                                    content={content}
                                    autoAdjustOverflow
                                    placement="bottomRight"
                                    trigger={['click']}
                                    getPopupContainer={getPopupContainer}
                                    overlayClassName={css`
                                      .ant-popover-inner-content {
                                        padding: 0;
                                      }
                                    `}
                                  >
                                    <Button>
                                      <ShareAltOutlined />
                                    </Button>
                                  </Popover>
                                );
                              },
                              'x-component-props': {
                                icon: 'MenuOutlined',
                                useAction: () => {
                                  return {
                                    run() {},
                                  };
                                },
                              },
                            },
                            direction: {
                              type: 'void',
                              'x-component': () => {
                                const menuItems = [
                                  {
                                    key: DirectionType.Both,
                                    label: 'All directions',
                                  },
                                  {
                                    key: DirectionType.Target,
                                    label: 'Target index',
                                  },
                                  {
                                    key: DirectionType.Source,
                                    label: 'Source index',
                                  },
                                ];
                                const content = (
                                  <div>
                                    <Menu
                                      defaultSelectedKeys={[DirectionType.Target]}
                                      selectable={true}
                                      className={css`
                                        .ant-menu-item {
                                          height: 32px;
                                          line-height: 32px;
                                        }
                                      `}
                                      style={{ maxHeight: '70vh', overflowY: 'auto', border: 'none' }}
                                      items={[
                                        { type: 'divider' },
                                        ...menuItems.map((v) => {
                                          return {
                                            key: v.key,
                                            label: t(v.label),
                                            onClick: (e: any) => {
                                              targetGraph.direction = v.key;
                                              const { filterConfig } = targetGraph;
                                              if (filterConfig) {
                                                handleFiterCollections(filterConfig.key);
                                              }
                                            },
                                          };
                                        }),
                                      ]}
                                    />
                                  </div>
                                );
                                return (
                                  <Popover
                                    content={content}
                                    autoAdjustOverflow
                                    placement="bottomRight"
                                    trigger={['click']}
                                    getPopupContainer={getPopupContainer}
                                    overlayClassName={css`
                                      .ant-popover-inner-content {
                                        padding: 0;
                                      }
                                    `}
                                  >
                                    <Button>
                                      <LineHeightOutlined />
                                    </Button>
                                  </Popover>
                                );
                              },
                            },
                            selectMode: {
                              type: 'void',
                              'x-component': () => {
                                return (
                                  <Tooltip title={t('Selection')}>
                                    <Switch
                                      onChange={(value) => {
                                        targetGraph.toggleSelection();
                                      }}
                                    />
                                  </Tooltip>
                                );
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                }}
                scope={{
                  useAsyncDataSource,
                  loadCollections,
                  useCreateActionAndRefreshCM: () => useCreateActionAndRefreshCM(setTargetNode),
                  enableInherits: database?.dialect === 'postgres',
                }}
              />
            </div>
          </CollapsedContext.Provider>
        </CollectionManagerProvider>
        <div id="container" style={{ width: '100vw', height: '100vh' }}></div>
        <div
          id="graph-minimap"
          className={styles.graphMinimap}
          style={{ width: '300px', height: '250px', right: '10px', bottom: '20px', position: 'fixed' }}
        ></div>
      </div>
    </Layout>
  );
});
GraphDrawPage.displayName = 'GraphDrawPage';
