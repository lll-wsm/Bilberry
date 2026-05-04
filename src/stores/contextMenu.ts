import { writable } from "svelte/store";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

function createContextMenu() {
  const { subscribe, set } = writable<ContextMenuState>({
    show: false,
    x: 0,
    y: 0,
    items: [],
  });

  function show(e: MouseEvent, items: ContextMenuItem[]) {
    e.preventDefault();
    e.stopPropagation();
    set({ show: true, x: e.clientX, y: e.clientY, items });
  }

  function hide() {
    set({ show: false, x: 0, y: 0, items: [] });
  }

  return { subscribe, show, hide };
}

export const contextMenu = createContextMenu();
