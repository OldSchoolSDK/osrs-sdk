jest.unmock("../../src/sdk/ControlPanelController");

import { ControlPanelController } from "../../src/sdk/ControlPanelController";
import { Settings } from "../../src/sdk/Settings";

describe("ControlPanelController tab hitboxes", () => {
  test("covers the full tab cell instead of leaving gaps between tabs", () => {
    const controller = new ControlPanelController();
    jest.spyOn(controller, "getTabScale").mockReturnValue(1);
    jest.spyOn(controller, "tabPosition").mockImplementation((index) => ({
      x: index * 33,
      y: 0,
    }));

    // Panel contents intentionally use a smaller scale than the tabs. Using
    // this value for tab hitboxes previously left the end of every cell dead.
    Settings.controlPanelScale = 0.5;
    const clickedInFormerGap = { offsetX: 25, offsetY: 18 } as MouseEvent;

    expect(controller.controlPanelClickDown(clickedInFormerGap)).toBe(true);
    expect(controller.selectedControl).toBe(controller.controls[0]);
  });
});
