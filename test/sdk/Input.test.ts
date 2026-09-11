import { InputController } from "../../src/sdk/Input";
import { Settings } from "../../src/sdk/Settings";

describe("InputController client-tick inputs", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Settings.inputDelay = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("does not expose an input to a world tick before a client tick samples it", () => {
    const controller = new InputController();
    const action = jest.fn();

    controller.queueClientAction(() => controller.queueAction(action));
    controller.onWorldTick();
    jest.runOnlyPendingTimers();
    controller.onWorldTick();

    expect(action).not.toHaveBeenCalled();

    controller.onClientTick();
    jest.runOnlyPendingTimers();
    controller.onWorldTick();

    expect(action).toHaveBeenCalledTimes(1);
  });

  test("applies latency after the client tick samples the input", () => {
    const controller = new InputController();
    const action = jest.fn();
    Settings.inputDelay = 80;

    controller.queueClientAction(() => controller.queueAction(action));
    controller.onClientTick();
    jest.advanceTimersByTime(79);
    controller.onWorldTick();
    expect(action).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    controller.onWorldTick();
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("preserves the order of multiple client inputs", () => {
    const controller = new InputController();
    const actions: number[] = [];

    controller.queueClientAction(() => controller.queueAction(() => actions.push(1)));
    controller.queueClientAction(() => controller.queueAction(() => actions.push(2)));
    controller.onClientTick();
    jest.runOnlyPendingTimers();
    controller.onWorldTick();

    expect(actions).toEqual([1, 2]);
  });
});
