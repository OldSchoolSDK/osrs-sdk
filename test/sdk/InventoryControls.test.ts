import { InventoryControls } from "../../src/sdk/controlpanels/InventoryControls";
import { InputController } from "../../src/sdk/Input";
import { Item } from "../../src/sdk/Item";
import { Player } from "../../src/sdk/Player";
import { Settings } from "../../src/sdk/Settings";
import { TestRegion } from "../../src/sdk/testing/TestRegion";
import { Trainer } from "../../src/sdk/Trainer";

test("dragging an item into an empty slot does not cache the slot placeholder", () => {
  class InventoryItem extends Item {
    override inventorySprite = document.createElement("img");
  }

  Settings.controlPanelScale = 1;
  const region = new TestRegion(10, 10);
  const item = new InventoryItem();
  const player = new Player(region, { x: 5, y: 5 }, { inventory: [item, ...new Array(27).fill(null)] });
  Trainer._player = player;
  jest.spyOn(InputController.controller, "queueAction").mockImplementation(() => undefined);

  const controls = new InventoryControls();
  controls.onWorldTick();
  controls.clickedDownItem = item;
  controls.draggedItem = true;
  controls.antiDragTimerAt = 0;

  // Slot one spans x=63..94 and y=21..52 when the control-panel scale is one.
  controls.panelClickUp(64, 51);

  expect(controls.inventoryCache[0]).toBeNull();
  expect(controls.inventoryCache[1]).toBe(item);
  expect(controls.inventoryCache.some((cachedItem) => (cachedItem as any)?.isPlaceholder)).toBe(false);
});
