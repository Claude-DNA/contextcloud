import { createContext } from 'react';

export const GraphContext = createContext<{
  bigNodes: { id: string; label: string }[];
  onParentChange: (nodeId: string, parentNodeId: string, parentLabel: string) => void;
}>({ bigNodes: [], onParentChange: () => {} });
