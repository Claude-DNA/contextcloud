import { tr } from './client';

/** React Flow's built-in screen-reader and button labels, in the page's language. Call while rendering. */
export function flowAriaLabels() {
  return {
    'node.a11yDescription.default': tr('Press enter or space to select a node. Press delete to remove it and escape to cancel.'),
    'node.a11yDescription.keyboardDisabled': tr('Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.'),
    'edge.a11yDescription.default': tr('Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.'),
    'controls.ariaLabel': tr('Control Panel'),
    'controls.zoomIn.ariaLabel': tr('Zoom In'),
    'controls.zoomOut.ariaLabel': tr('Zoom Out'),
    'controls.fitView.ariaLabel': tr('Fit View'),
    'controls.interactive.ariaLabel': tr('Toggle Interactivity'),
    'minimap.ariaLabel': tr('Mini Map'),
    'handle.ariaLabel': tr('Handle'),
  };
}
